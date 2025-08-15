const orderManagementService = require('../../../src/services/orderManagementService');
const {
  prisma,
  createTestUser,
  createTestMarketplace,
  createTestMarketplaceAccount,
  createTestProduct,
  createTestOrder,
  createTestInventory,
  mockShopeeAPI,
  withTransaction
} = require('../../setup');

describe('OrderManagementService', () => {
  let testUser, testMarketplace, testMarketplaceAccount, testProduct;

  beforeEach(async () => {
    testUser = await createTestUser();
    testMarketplace = await createTestMarketplace({
      name: 'Shopee',
      code: 'SHOPEE'
    });
    testMarketplaceAccount = await createTestMarketplaceAccount(
      testUser.id,
      testMarketplace.id
    );
    testProduct = await createTestProduct(testUser.id);
    await createTestInventory(testProduct.id, { stockQuantity: 50 });
  });

  describe('processMarketplaceOrder', () => {
    it('should create new order from marketplace data', async () => {
      const marketplaceOrder = {
        marketplaceOrderId: 'SHOPEE-12345',
        status: 'TO_SHIP',
        totalAmount: 150000,
        shippingCost: 15000,
        customerInfo: {
          name: 'John Doe',
          email: 'john@example.com',
          phone: '081234567890'
        },
        shippingAddress: {
          street: 'Jl. Test 123',
          city: 'Jakarta',
          state: 'DKI Jakarta',
          postalCode: '12345',
          country: 'Indonesia'
        },
        orderDate: new Date().toISOString(),
        items: [
          {
            productId: 'SHOPEE-PROD-123',
            sku: testProduct.sku,
            name: testProduct.name,
            quantity: 2,
            price: 75000,
            totalPrice: 150000
          }
        ]
      };

      const result = await orderManagementService.processMarketplaceOrder(
        testMarketplaceAccount,
        marketplaceOrder
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('created');
      expect(result.order).toBeDefined();

      // Verify order was created in database
      const createdOrder = await prisma.order.findUnique({
        where: { id: result.order.id },
        include: { orderItems: true }
      });

      expect(createdOrder).toBeDefined();
      expect(createdOrder.marketplaceOrderId).toBe('SHOPEE-12345');
      expect(createdOrder.status).toBe('CONFIRMED'); // Normalized from TO_SHIP
      expect(createdOrder.totalAmount).toBe(150000);
      expect(createdOrder.orderItems).toHaveLength(1);
      expect(createdOrder.orderItems[0].quantity).toBe(2);
    });

    it('should update existing order when order already exists', async () => {
      // Create existing order
      const existingOrder = await createTestOrder(
        testUser.id,
        testMarketplaceAccount.id,
        {
          marketplaceOrderId: 'SHOPEE-12345',
          status: 'PENDING'
        }
      );

      const marketplaceOrder = {
        marketplaceOrderId: 'SHOPEE-12345',
        status: 'SHIPPED',
        totalAmount: 150000,
        shippingCost: 15000,
        customerInfo: {
          name: 'John Doe',
          email: 'john@example.com'
        },
        orderDate: new Date().toISOString()
      };

      const result = await orderManagementService.processMarketplaceOrder(
        testMarketplaceAccount,
        marketplaceOrder
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('updated');

      // Verify order was updated
      const updatedOrder = await prisma.order.findUnique({
        where: { id: existingOrder.id }
      });

      expect(updatedOrder.status).toBe('SHIPPED');
    });

    it('should update inventory when creating order with matching product', async () => {
      const initialInventory = await prisma.inventory.findFirst({
        where: { productId: testProduct.id }
      });

      const marketplaceOrder = {
        marketplaceOrderId: 'SHOPEE-12345',
        status: 'TO_SHIP',
        totalAmount: 150000,
        orderDate: new Date().toISOString(),
        items: [
          {
            sku: testProduct.sku,
            name: testProduct.name,
            quantity: 5,
            price: 30000,
            totalPrice: 150000
          }
        ]
      };

      await orderManagementService.processMarketplaceOrder(
        testMarketplaceAccount,
        marketplaceOrder
      );

      // Verify inventory was updated
      const updatedInventory = await prisma.inventory.findFirst({
        where: { productId: testProduct.id }
      });

      expect(updatedInventory.stockQuantity).toBe(initialInventory.stockQuantity - 5);
      expect(updatedInventory.availableQuantity).toBe(initialInventory.availableQuantity - 5);

      // Verify stock movement was created
      const stockMovement = await prisma.stockMovement.findFirst({
        where: {
          productId: testProduct.id,
          movementType: 'OUT'
        }
      });

      expect(stockMovement).toBeDefined();
      expect(stockMovement.quantity).toBe(5);
      expect(stockMovement.reason).toContain('Order');
    });
  });

  describe('normalizeOrderStatus', () => {
    it('should normalize Shopee statuses correctly', () => {
      expect(orderManagementService.normalizeOrderStatus('UNPAID')).toBe('PENDING');
      expect(orderManagementService.normalizeOrderStatus('TO_SHIP')).toBe('CONFIRMED');
      expect(orderManagementService.normalizeOrderStatus('SHIPPED')).toBe('SHIPPED');
      expect(orderManagementService.normalizeOrderStatus('COMPLETED')).toBe('DELIVERED');
      expect(orderManagementService.normalizeOrderStatus('CANCELLED')).toBe('CANCELLED');
    });

    it('should normalize Tokopedia statuses correctly', () => {
      expect(orderManagementService.normalizeOrderStatus('new')).toBe('PENDING');
      expect(orderManagementService.normalizeOrderStatus('processed')).toBe('PROCESSING');
      expect(orderManagementService.normalizeOrderStatus('sent')).toBe('SHIPPED');
      expect(orderManagementService.normalizeOrderStatus('delivered')).toBe('DELIVERED');
      expect(orderManagementService.normalizeOrderStatus('cancelled')).toBe('CANCELLED');
    });

    it('should normalize Lazada statuses correctly', () => {
      expect(orderManagementService.normalizeOrderStatus('pending')).toBe('PENDING');
      expect(orderManagementService.normalizeOrderStatus('packed')).toBe('PROCESSING');
      expect(orderManagementService.normalizeOrderStatus('ready_to_ship')).toBe('CONFIRMED');
      expect(orderManagementService.normalizeOrderStatus('shipped')).toBe('SHIPPED');
      expect(orderManagementService.normalizeOrderStatus('delivered')).toBe('DELIVERED');
      expect(orderManagementService.normalizeOrderStatus('canceled')).toBe('CANCELLED');
      expect(orderManagementService.normalizeOrderStatus('returned')).toBe('REFUNDED');
    });

    it('should return PENDING for unknown statuses', () => {
      expect(orderManagementService.normalizeOrderStatus('unknown_status')).toBe('PENDING');
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status and create history', async () => {
      const order = await createTestOrder(
        testUser.id,
        testMarketplaceAccount.id,
        { status: 'PENDING' }
      );

      const updatedOrder = await orderManagementService.updateOrderStatus(
        order.id,
        'CONFIRMED',
        'SYSTEM',
        'Order confirmed by system'
      );

      expect(updatedOrder.status).toBe('CONFIRMED');

      // Verify status history was created
      const statusHistory = await prisma.orderStatusHistory.findFirst({
        where: {
          orderId: order.id,
          status: 'CONFIRMED'
        }
      });

      expect(statusHistory).toBeDefined();
      expect(statusHistory.previousStatus).toBe('PENDING');
      expect(statusHistory.changedBy).toBe('SYSTEM');
      expect(statusHistory.reason).toBe('Order confirmed by system');
    });

    it('should throw error for non-existent order', async () => {
      await expect(
        orderManagementService.updateOrderStatus(
          'non-existent-id',
          'CONFIRMED',
          'SYSTEM'
        )
      ).rejects.toThrow('Order not found');
    });
  });

  describe('syncMarketplaceOrders', () => {
    beforeEach(() => {
      // Mock marketplace API responses
      mockShopeeAPI.getOrders.mockResolvedValue({
        data: [
          {
            marketplaceOrderId: 'SHOPEE-001',
            status: 'TO_SHIP',
            totalAmount: 100000,
            shippingCost: 10000,
            customerInfo: {
              name: 'Customer 1',
              email: 'customer1@test.com'
            },
            orderDate: new Date().toISOString(),
            items: [
              {
                sku: testProduct.sku,
                name: testProduct.name,
                quantity: 1,
                price: 100000,
                totalPrice: 100000
              }
            ]
          }
        ],
        hasMore: false
      });
    });

    it('should sync orders from marketplace successfully', async () => {
      // Mock MarketplaceFactory to return our mock API
      const MarketplaceFactory = require('../../../src/integrations/MarketplaceFactory');
      jest.spyOn(MarketplaceFactory, 'createFromAccount').mockReturnValue({
        getOrders: mockShopeeAPI.getOrders
      });

      const result = await orderManagementService.syncMarketplaceOrders(
        testMarketplaceAccount,
        {
          dateFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
          dateTo: new Date()
        }
      );

      expect(result.success).toBe(true);
      expect(result.totalSynced).toBe(1);
      expect(result.totalErrors).toBe(0);

      // Verify order was created
      const syncedOrder = await prisma.order.findFirst({
        where: {
          marketplaceOrderId: 'SHOPEE-001',
          marketplaceAccountId: testMarketplaceAccount.id
        }
      });

      expect(syncedOrder).toBeDefined();
      expect(syncedOrder.status).toBe('CONFIRMED');
    });

    it('should handle API errors gracefully', async () => {
      // Mock API to throw error
      mockShopeeAPI.getOrders.mockRejectedValue(new Error('API Error'));

      const MarketplaceFactory = require('../../../src/integrations/MarketplaceFactory');
      jest.spyOn(MarketplaceFactory, 'createFromAccount').mockReturnValue({
        getOrders: mockShopeeAPI.getOrders
      });

      await expect(
        orderManagementService.syncMarketplaceOrders(testMarketplaceAccount)
      ).rejects.toThrow('API Error');
    });
  });

  describe('generateOrderNumber', () => {
    it('should generate unique order numbers', () => {
      const orderNumber1 = orderManagementService.generateOrderNumber('SHOPEE', 'ORDER-123');
      const orderNumber2 = orderManagementService.generateOrderNumber('SHOPEE', 'ORDER-123');

      expect(orderNumber1).toMatch(/^SHOPEE-ORDER-123-\d{6}$/);
      expect(orderNumber2).toMatch(/^SHOPEE-ORDER-123-\d{6}$/);
      expect(orderNumber1).not.toBe(orderNumber2);
    });

    it('should include marketplace code and order ID', () => {
      const orderNumber = orderManagementService.generateOrderNumber('TOKOPEDIA', 'TKP-456');
      expect(orderNumber).toMatch(/^TOKOPEDIA-TKP-456-\d{6}$/);
    });
  });

  describe('applyAutomationRules', () => {
    it('should apply matching automation rules', async () => {
      // Create automation rule
      const rule = await prisma.orderAutomationRule.create({
        data: {
          userId: testUser.id,
          name: 'Auto Confirm High Value Orders',
          isActive: true,
          conditions: {
            create: [
              {
                field: 'totalAmount',
                operator: 'greater_than',
                value: '50000'
              }
            ]
          },
          actions: {
            create: [
              {
                actionType: 'update_status',
                actionValue: 'CONFIRMED'
              }
            ]
          }
        },
        include: {
          conditions: true,
          actions: true
        }
      });

      const order = await createTestOrder(
        testUser.id,
        testMarketplaceAccount.id,
        {
          status: 'PENDING',
          totalAmount: 100000
        }
      );

      // Mock the automation rules loading
      orderManagementService.automationRules.set(testUser.id, [rule]);

      await orderManagementService.applyAutomationRules(order);

      // Verify order status was updated
      const updatedOrder = await prisma.order.findUnique({
        where: { id: order.id }
      });

      expect(updatedOrder.status).toBe('CONFIRMED');
    });

    it('should not apply rules when conditions do not match', async () => {
      // Create automation rule with condition that won't match
      const rule = await prisma.orderAutomationRule.create({
        data: {
          userId: testUser.id,
          name: 'Auto Confirm High Value Orders',
          isActive: true,
          conditions: {
            create: [
              {
                field: 'totalAmount',
                operator: 'greater_than',
                value: '200000'
              }
            ]
          },
          actions: {
            create: [
              {
                actionType: 'update_status',
                actionValue: 'CONFIRMED'
              }
            ]
          }
        },
        include: {
          conditions: true,
          actions: true
        }
      });

      const order = await createTestOrder(
        testUser.id,
        testMarketplaceAccount.id,
        {
          status: 'PENDING',
          totalAmount: 100000 // Less than 200000
        }
      );

      // Mock the automation rules loading
      orderManagementService.automationRules.set(testUser.id, [rule]);

      await orderManagementService.applyAutomationRules(order);

      // Verify order status was not changed
      const unchangedOrder = await prisma.order.findUnique({
        where: { id: order.id }
      });

      expect(unchangedOrder.status).toBe('PENDING');
    });
  });

  describe('error handling', () => {
    it('should handle database transaction failures', async () => {
      // Mock prisma to throw error
      const originalCreate = prisma.order.create;
      prisma.order.create = jest.fn().mockRejectedValue(new Error('Database error'));

      const marketplaceOrder = {
        marketplaceOrderId: 'SHOPEE-ERROR',
        status: 'TO_SHIP',
        totalAmount: 100000,
        orderDate: new Date().toISOString(),
        items: []
      };

      const result = await orderManagementService.processMarketplaceOrder(
        testMarketplaceAccount,
        marketplaceOrder
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');

      // Restore original function
      prisma.order.create = originalCreate;
    });
  });
});
