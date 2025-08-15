const request = require('supertest');
const app = require('../../../src/app');
const {
  prisma,
  createTestUser,
  createTestMarketplace,
  createTestMarketplaceAccount,
  createTestProduct,
  createTestOrder,
  createTestOrderItem,
  generateJWT,
  makeAuthenticatedRequest
} = require('../../setup');

describe('Orders API Integration Tests', () => {
  let testUser, testMarketplace, testMarketplaceAccount, testProduct, testOrder, authToken;

  beforeEach(async () => {
    testUser = await createTestUser();
    testMarketplace = await createTestMarketplace();
    testMarketplaceAccount = await createTestMarketplaceAccount(
      testUser.id,
      testMarketplace.id
    );
    testProduct = await createTestProduct(testUser.id);
    testOrder = await createTestOrder(testUser.id, testMarketplaceAccount.id);
    await createTestOrderItem(testOrder.id, testProduct.id);
    
    authToken = generateJWT(testUser.id);
  });

  describe('GET /api/orders', () => {
    it('should return user orders with pagination', async () => {
      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.orders).toBeDefined();
      expect(response.body.orders).toHaveLength(1);
      expect(response.body.orders[0].id).toBe(testOrder.id);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.total).toBe(1);
    });

    it('should filter orders by status', async () => {
      // Create order with different status
      await createTestOrder(testUser.id, testMarketplaceAccount.id, {
        orderNumber: 'TEST-ORDER-002',
        marketplaceOrderId: 'MP-ORDER-002',
        status: 'SHIPPED'
      });

      const response = await request(app)
        .get('/api/orders?status=SHIPPED')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.orders).toHaveLength(1);
      expect(response.body.orders[0].status).toBe('SHIPPED');
    });

    it('should filter orders by marketplace', async () => {
      // Create another marketplace and order
      const marketplace2 = await createTestMarketplace({
        name: 'Tokopedia',
        code: 'TOKOPEDIA'
      });
      const account2 = await createTestMarketplaceAccount(testUser.id, marketplace2.id);
      await createTestOrder(testUser.id, account2.id, {
        orderNumber: 'TEST-ORDER-TOKPED',
        marketplaceOrderId: 'TOKPED-ORDER-001'
      });

      const response = await request(app)
        .get(`/api/orders?marketplace=${marketplace2.code}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.orders).toHaveLength(1);
      expect(response.body.orders[0].marketplaceAccount.marketplace.code).toBe('TOKOPEDIA');
    });

    it('should search orders by order number', async () => {
      const response = await request(app)
        .get(`/api/orders?search=${testOrder.orderNumber}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.orders).toHaveLength(1);
      expect(response.body.orders[0].orderNumber).toBe(testOrder.orderNumber);
    });

    it('should return empty array for other user orders', async () => {
      const otherUser = await createTestUser({
        email: 'other@example.com'
      });
      const otherToken = generateJWT(otherUser.id);

      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      expect(response.body.orders).toHaveLength(0);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/orders')
        .expect(401);
    });
  });

  describe('GET /api/orders/:id', () => {
    it('should return order details with items', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.order).toBeDefined();
      expect(response.body.order.id).toBe(testOrder.id);
      expect(response.body.order.orderItems).toBeDefined();
      expect(response.body.order.orderItems).toHaveLength(1);
      expect(response.body.order.marketplaceAccount).toBeDefined();
      expect(response.body.order.statusHistory).toBeDefined();
    });

    it('should return 404 for non-existent order', async () => {
      await request(app)
        .get('/api/orders/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 403 for other user order', async () => {
      const otherUser = await createTestUser({
        email: 'other@example.com'
      });
      const otherToken = generateJWT(otherUser.id);

      await request(app)
        .get(`/api/orders/${testOrder.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });
  });

  describe('PATCH /api/orders/:id/status', () => {
    it('should update order status successfully', async () => {
      const updateData = {
        status: 'CONFIRMED',
        reason: 'Order confirmed by admin'
      };

      const response = await request(app)
        .patch(`/api/orders/${testOrder.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.message).toBe('Order status updated successfully');
      expect(response.body.order.status).toBe('CONFIRMED');

      // Verify status history was created
      const statusHistory = await prisma.orderStatusHistory.findFirst({
        where: {
          orderId: testOrder.id,
          status: 'CONFIRMED'
        }
      });

      expect(statusHistory).toBeDefined();
      expect(statusHistory.reason).toBe('Order confirmed by admin');
    });

    it('should validate status values', async () => {
      const updateData = {
        status: 'INVALID_STATUS',
        reason: 'Test reason'
      };

      const response = await request(app)
        .patch(`/api/orders/${testOrder.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should require reason field', async () => {
      const updateData = {
        status: 'CONFIRMED'
      };

      const response = await request(app)
        .patch(`/api/orders/${testOrder.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 403 for other user order', async () => {
      const otherUser = await createTestUser({
        email: 'other@example.com'
      });
      const otherToken = generateJWT(otherUser.id);

      const updateData = {
        status: 'CONFIRMED',
        reason: 'Test reason'
      };

      await request(app)
        .patch(`/api/orders/${testOrder.id}/status`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send(updateData)
        .expect(403);
    });
  });

  describe('PATCH /api/orders/:id/assign', () => {
    it('should assign order to user successfully', async () => {
      const assignData = {
        assignedUserId: testUser.id,
        reason: 'Assigned for processing'
      };

      const response = await request(app)
        .patch(`/api/orders/${testOrder.id}/assign`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(assignData)
        .expect(200);

      expect(response.body.message).toBe('Order assigned successfully');
      expect(response.body.order.assignedUserId).toBe(testUser.id);
      expect(response.body.order.assignedUser).toBeDefined();

      // Verify activity log was created
      const statusHistory = await prisma.orderStatusHistory.findFirst({
        where: {
          orderId: testOrder.id,
          reason: { contains: 'assigned' }
        }
      });

      expect(statusHistory).toBeDefined();
    });

    it('should allow unassigning order', async () => {
      const assignData = {
        assignedUserId: null,
        reason: 'Unassigned from user'
      };

      const response = await request(app)
        .patch(`/api/orders/${testOrder.id}/assign`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(assignData)
        .expect(200);

      expect(response.body.order.assignedUserId).toBeNull();
    });
  });

  describe('POST /api/orders/:id/tags', () => {
    it('should add tag to order successfully', async () => {
      const tagData = {
        tag: 'Priority High'
      };

      const response = await request(app)
        .post(`/api/orders/${testOrder.id}/tags`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(tagData)
        .expect(200);

      expect(response.body.message).toBe('Tag added successfully');
      expect(response.body.tag.tag).toBe('Priority High');

      // Verify tag was created in database
      const orderTag = await prisma.orderTag.findFirst({
        where: {
          orderId: testOrder.id,
          tag: 'Priority High'
        }
      });

      expect(orderTag).toBeDefined();
      expect(orderTag.addedBy).toBe(testUser.email);
    });

    it('should prevent duplicate tags', async () => {
      // Add tag first time
      await prisma.orderTag.create({
        data: {
          orderId: testOrder.id,
          tag: 'Existing Tag',
          addedBy: testUser.email,
          addedAt: new Date()
        }
      });

      const tagData = {
        tag: 'Existing Tag'
      };

      const response = await request(app)
        .post(`/api/orders/${testOrder.id}/tags`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(tagData)
        .expect(400);

      expect(response.body.error).toBe('Tag already exists');
    });

    it('should validate tag length', async () => {
      const tagData = {
        tag: 'A'.repeat(51) // Exceeds 50 character limit
      };

      const response = await request(app)
        .post(`/api/orders/${testOrder.id}/tags`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(tagData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/order-management/sync', () => {
    it('should trigger order sync successfully', async () => {
      const syncData = {
        marketplaceAccountId: testMarketplaceAccount.id,
        dateFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        dateTo: new Date().toISOString()
      };

      // Mock the order management service
      const orderManagementService = require('../../../src/services/orderManagementService');
      jest.spyOn(orderManagementService, 'syncMarketplaceOrders').mockResolvedValue({
        success: true,
        totalSynced: 5,
        totalErrors: 0
      });

      const response = await request(app)
        .post('/api/order-management/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send(syncData)
        .expect(200);

      expect(response.body.message).toBe('Order sync triggered successfully');
      expect(response.body.result.success).toBe(true);
      expect(response.body.result.totalSynced).toBe(5);

      // Verify service was called with correct parameters
      expect(orderManagementService.syncMarketplaceOrders).toHaveBeenCalledWith(
        expect.objectContaining({
          id: testMarketplaceAccount.id
        }),
        expect.objectContaining({
          dateFrom: expect.any(Date),
          dateTo: expect.any(Date)
        })
      );
    });

    it('should validate marketplace account ownership', async () => {
      const otherUser = await createTestUser({
        email: 'other@example.com'
      });
      const otherMarketplace = await createTestMarketplace({
        name: 'Other Marketplace',
        code: 'OTHER'
      });
      const otherAccount = await createTestMarketplaceAccount(
        otherUser.id,
        otherMarketplace.id
      );

      const syncData = {
        marketplaceAccountId: otherAccount.id
      };

      const response = await request(app)
        .post('/api/order-management/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send(syncData)
        .expect(400);

      expect(response.body.error).toBe('Invalid marketplace account');
    });

    it('should require marketplaceAccountId', async () => {
      const syncData = {};

      const response = await request(app)
        .post('/api/order-management/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send(syncData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/order-management/stats', () => {
    beforeEach(async () => {
      // Create additional test data for stats
      await createTestOrder(testUser.id, testMarketplaceAccount.id, {
        orderNumber: 'TEST-ORDER-002',
        marketplaceOrderId: 'MP-ORDER-002',
        status: 'DELIVERED',
        totalAmount: 200000,
        orderDate: new Date()
      });

      await createTestOrder(testUser.id, testMarketplaceAccount.id, {
        orderNumber: 'TEST-ORDER-003',
        marketplaceOrderId: 'MP-ORDER-003',
        status: 'CANCELLED',
        totalAmount: 100000,
        orderDate: new Date()
      });
    });

    it('should return order statistics', async () => {
      const response = await request(app)
        .get('/api/order-management/stats?timeRange=month')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.stats).toBeDefined();
      expect(response.body.stats.totalOrders).toBe(3);
      expect(response.body.stats.totalRevenue).toBeGreaterThan(0);
      expect(response.body.stats.averageOrderValue).toBeGreaterThan(0);
      expect(response.body.stats.ordersByStatus).toBeDefined();
      expect(response.body.stats.ordersByMarketplace).toBeDefined();
      expect(response.body.stats.timeRange).toBe('month');
    });

    it('should handle different time ranges', async () => {
      const response = await request(app)
        .get('/api/order-management/stats?timeRange=week')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.stats.timeRange).toBe('week');
    });

    it('should default to month time range', async () => {
      const response = await request(app)
        .get('/api/order-management/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.stats.timeRange).toBe('month');
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock prisma to throw error
      const originalFindMany = prisma.order.findMany;
      prisma.order.findMany = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body.error).toBe('Internal server error');

      // Restore original function
      prisma.order.findMany = originalFindMany;
    });

    it('should handle invalid JWT tokens', async () => {
      await request(app)
        .get('/api/orders')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should handle missing authorization header', async () => {
      await request(app)
        .get('/api/orders')
        .expect(401);
    });
  });

  describe('Pagination', () => {
    beforeEach(async () => {
      // Create multiple orders for pagination testing
      for (let i = 2; i <= 25; i++) {
        await createTestOrder(testUser.id, testMarketplaceAccount.id, {
          orderNumber: `TEST-ORDER-${i.toString().padStart(3, '0')}`,
          marketplaceOrderId: `MP-ORDER-${i.toString().padStart(3, '0')}`
        });
      }
    });

    it('should paginate results correctly', async () => {
      const response = await request(app)
        .get('/api/orders?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.orders).toHaveLength(10);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(10);
      expect(response.body.pagination.total).toBe(25);
      expect(response.body.pagination.totalPages).toBe(3);
      expect(response.body.pagination.hasNext).toBe(true);
      expect(response.body.pagination.hasPrev).toBe(false);
    });

    it('should handle second page correctly', async () => {
      const response = await request(app)
        .get('/api/orders?page=2&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.orders).toHaveLength(10);
      expect(response.body.pagination.page).toBe(2);
      expect(response.body.pagination.hasNext).toBe(true);
      expect(response.body.pagination.hasPrev).toBe(true);
    });

    it('should handle last page correctly', async () => {
      const response = await request(app)
        .get('/api/orders?page=3&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.orders).toHaveLength(5);
      expect(response.body.pagination.page).toBe(3);
      expect(response.body.pagination.hasNext).toBe(false);
      expect(response.body.pagination.hasPrev).toBe(true);
    });
  });
});
