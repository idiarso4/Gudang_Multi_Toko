const { prisma, transaction } = require('../utils/database');
const MarketplaceFactory = require('../integrations/MarketplaceFactory');
const { addOrderJob } = require('../jobs/queueManager');
const logger = require('../utils/logger');
const { io } = require('../server');

/**
 * Order Management Service
 * Handles unified order management across multiple marketplaces
 */
class OrderManagementService {
  constructor() {
    this.processingOrders = new Set(); // Track orders being processed
    this.statusMappings = new Map(); // Cache status mappings
    this.automationRules = new Map(); // Cache automation rules
  }

  /**
   * Initialize order management service
   */
  async initialize() {
    logger.info('Initializing Order Management Service...');
    
    // Load automation rules
    await this.loadAutomationRules();
    
    // Setup periodic order sync
    this.setupPeriodicOrderSync();
    
    // Setup order status monitoring
    this.setupStatusMonitoring();
    
    logger.info('Order Management Service initialized');
  }

  /**
   * Load automation rules from database
   */
  async loadAutomationRules() {
    try {
      const rules = await prisma.orderAutomationRule.findMany({
        where: { isActive: true },
        include: {
          user: true,
          conditions: true,
          actions: true
        }
      });

      this.automationRules.clear();
      rules.forEach(rule => {
        if (!this.automationRules.has(rule.userId)) {
          this.automationRules.set(rule.userId, []);
        }
        this.automationRules.get(rule.userId).push(rule);
      });

      logger.info(`Loaded ${rules.length} automation rules`);
    } catch (error) {
      logger.error('Failed to load automation rules:', error);
    }
  }

  /**
   * Setup periodic order sync (every 10 minutes)
   */
  setupPeriodicOrderSync() {
    setInterval(async () => {
      await this.syncAllMarketplaceOrders();
    }, 10 * 60 * 1000); // 10 minutes
  }

  /**
   * Setup order status monitoring (every 5 minutes)
   */
  setupStatusMonitoring() {
    setInterval(async () => {
      await this.monitorOrderStatuses();
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Sync orders from all connected marketplaces
   */
  async syncAllMarketplaceOrders() {
    try {
      logger.info('Starting periodic order sync...');

      const marketplaceAccounts = await prisma.userMarketplaceAccount.findMany({
        where: { 
          isConnected: true,
          user: { isActive: true }
        },
        include: {
          marketplace: true,
          user: true
        }
      });

      const syncPromises = marketplaceAccounts.map(account => 
        this.syncMarketplaceOrders(account, {
          dateFrom: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          dateTo: new Date()
        })
      );

      const results = await Promise.allSettled(syncPromises);
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      logger.info(`Periodic order sync completed: ${successful} successful, ${failed} failed`);

    } catch (error) {
      logger.error('Error in periodic order sync:', error);
    }
  }

  /**
   * Sync orders from specific marketplace
   */
  async syncMarketplaceOrders(marketplaceAccount, options = {}) {
    const syncKey = `order-sync-${marketplaceAccount.id}`;
    
    if (this.processingOrders.has(syncKey)) {
      logger.debug(`Order sync already in progress for ${marketplaceAccount.marketplace.name}`);
      return;
    }

    this.processingOrders.add(syncKey);

    try {
      logger.info(`Syncing orders from ${marketplaceAccount.marketplace.name}...`);

      // Create marketplace integration
      const integration = MarketplaceFactory.createFromAccount(marketplaceAccount);

      // Fetch orders from marketplace
      let page = 1;
      let hasMore = true;
      let totalSynced = 0;
      let totalErrors = 0;

      while (hasMore && page <= 10) { // Limit to 10 pages per sync
        try {
          const ordersResponse = await integration.getOrders({
            page,
            limit: 50,
            dateFrom: options.dateFrom,
            dateTo: options.dateTo,
            status: options.status
          });

          const orders = ordersResponse.data || [];
          hasMore = ordersResponse.hasMore && orders.length > 0;

          for (const marketplaceOrder of orders) {
            try {
              const result = await this.processMarketplaceOrder(
                marketplaceAccount,
                marketplaceOrder
              );
              
              if (result.success) {
                totalSynced++;
                
                // Apply automation rules
                await this.applyAutomationRules(result.order);
              } else {
                totalErrors++;
              }

            } catch (error) {
              logger.error(`Failed to process order ${marketplaceOrder.marketplaceOrderId}:`, error);
              totalErrors++;
            }
          }

          page++;
        } catch (error) {
          logger.error(`Failed to fetch orders page ${page}:`, error);
          break;
        }
      }

      // Emit sync completion event
      this.emitOrderSyncUpdate(marketplaceAccount.userId, {
        type: 'order-sync-completed',
        marketplaceAccountId: marketplaceAccount.id,
        marketplaceName: marketplaceAccount.marketplace.name,
        totalSynced,
        totalErrors
      });

      logger.info(`Order sync completed for ${marketplaceAccount.marketplace.name}: ${totalSynced} synced, ${totalErrors} errors`);

      return {
        success: true,
        totalSynced,
        totalErrors
      };

    } catch (error) {
      logger.error(`Order sync failed for ${marketplaceAccount.marketplace.name}:`, error);
      
      this.emitOrderSyncUpdate(marketplaceAccount.userId, {
        type: 'order-sync-failed',
        marketplaceAccountId: marketplaceAccount.id,
        marketplaceName: marketplaceAccount.marketplace.name,
        error: error.message
      });

      throw error;

    } finally {
      this.processingOrders.delete(syncKey);
    }
  }

  /**
   * Process single marketplace order
   */
  async processMarketplaceOrder(marketplaceAccount, marketplaceOrder) {
    try {
      // Check if order already exists
      const existingOrder = await prisma.order.findFirst({
        where: {
          marketplaceOrderId: marketplaceOrder.marketplaceOrderId,
          marketplaceAccountId: marketplaceAccount.id
        }
      });

      if (existingOrder) {
        // Update existing order
        const updatedOrder = await this.updateExistingOrder(existingOrder, marketplaceOrder);
        return { success: true, order: updatedOrder, action: 'updated' };
      } else {
        // Create new order
        const newOrder = await this.createNewOrder(marketplaceAccount, marketplaceOrder);
        return { success: true, order: newOrder, action: 'created' };
      }

    } catch (error) {
      logger.error(`Failed to process marketplace order:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create new order from marketplace data
   */
  async createNewOrder(marketplaceAccount, marketplaceOrder) {
    return await transaction(async (tx) => {
      // Create order
      const order = await tx.order.create({
        data: {
          userId: marketplaceAccount.userId,
          marketplaceAccountId: marketplaceAccount.id,
          orderNumber: this.generateOrderNumber(marketplaceAccount.marketplace.code, marketplaceOrder.marketplaceOrderId),
          marketplaceOrderId: marketplaceOrder.marketplaceOrderId,
          status: this.normalizeOrderStatus(marketplaceOrder.status),
          totalAmount: marketplaceOrder.totalAmount || 0,
          shippingCost: marketplaceOrder.shippingCost || 0,
          customerInfo: marketplaceOrder.customerInfo || {},
          shippingAddress: marketplaceOrder.shippingAddress || {},
          orderDate: new Date(marketplaceOrder.orderDate),
          notes: marketplaceOrder.notes || ''
        }
      });

      // Create order items
      if (marketplaceOrder.items && marketplaceOrder.items.length > 0) {
        for (const item of marketplaceOrder.items) {
          // Try to find matching product
          const product = await tx.product.findFirst({
            where: {
              userId: marketplaceAccount.userId,
              OR: [
                { sku: item.sku },
                { 
                  marketplaceProducts: {
                    some: {
                      marketplaceProductId: item.productId,
                      marketplaceAccountId: marketplaceAccount.id
                    }
                  }
                }
              ]
            }
          });

          // Find variant if exists
          let variant = null;
          if (product && item.variantId) {
            variant = await tx.productVariant.findFirst({
              where: {
                productId: product.id,
                OR: [
                  { sku: item.sku },
                  {
                    marketplaceProducts: {
                      some: {
                        marketplaceProductId: item.variantId,
                        marketplaceAccountId: marketplaceAccount.id
                      }
                    }
                  }
                ]
              }
            });
          }

          // Create order item
          await tx.orderItem.create({
            data: {
              orderId: order.id,
              productId: product?.id,
              variantId: variant?.id,
              sku: item.sku,
              productName: item.name,
              variantName: variant?.variantName,
              quantity: item.quantity,
              unitPrice: item.price,
              totalPrice: item.totalPrice,
              productData: item
            }
          });

          // Update inventory if product found
          if (product) {
            await this.updateInventoryForOrder(tx, product.id, variant?.id, item.quantity, order);
          }
        }
      }

      // Create order status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: order.status,
          changedBy: 'SYSTEM',
          reason: 'Order imported from marketplace',
          changedAt: new Date()
        }
      });

      return order;
    });
  }

  /**
   * Update existing order
   */
  async updateExistingOrder(existingOrder, marketplaceOrder) {
    return await transaction(async (tx) => {
      const oldStatus = existingOrder.status;
      const newStatus = this.normalizeOrderStatus(marketplaceOrder.status);

      // Update order
      const updatedOrder = await tx.order.update({
        where: { id: existingOrder.id },
        data: {
          status: newStatus,
          totalAmount: marketplaceOrder.totalAmount || existingOrder.totalAmount,
          shippingCost: marketplaceOrder.shippingCost || existingOrder.shippingCost,
          customerInfo: marketplaceOrder.customerInfo || existingOrder.customerInfo,
          shippingAddress: marketplaceOrder.shippingAddress || existingOrder.shippingAddress,
          notes: marketplaceOrder.notes || existingOrder.notes,
          updatedAt: new Date()
        }
      });

      // Create status history if status changed
      if (oldStatus !== newStatus) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: existingOrder.id,
            status: newStatus,
            previousStatus: oldStatus,
            changedBy: 'SYSTEM',
            reason: 'Status updated from marketplace',
            changedAt: new Date()
          }
        });
      }

      return updatedOrder;
    });
  }

  /**
   * Update inventory for order
   */
  async updateInventoryForOrder(tx, productId, variantId, quantity, order) {
    const inventory = await tx.inventory.findFirst({
      where: {
        productId,
        variantId: variantId || null
      }
    });

    if (inventory) {
      const newStock = Math.max(0, inventory.stockQuantity - quantity);
      const newAvailable = Math.max(0, inventory.availableQuantity - quantity);

      await tx.inventory.update({
        where: { id: inventory.id },
        data: {
          stockQuantity: newStock,
          availableQuantity: newAvailable,
          lastUpdated: new Date()
        }
      });

      // Create stock movement
      await tx.stockMovement.create({
        data: {
          productId,
          variantId,
          orderId: order.id,
          userId: order.userId,
          movementType: 'OUT',
          quantity,
          stockBefore: inventory.stockQuantity,
          stockAfter: newStock,
          reason: `Order ${order.orderNumber}`,
          createdAt: new Date()
        }
      });
    }
  }

  /**
   * Generate order number
   */
  generateOrderNumber(marketplaceCode, marketplaceOrderId) {
    const timestamp = Date.now().toString().slice(-6);
    return `${marketplaceCode}-${marketplaceOrderId}-${timestamp}`;
  }

  /**
   * Normalize order status across marketplaces
   */
  normalizeOrderStatus(marketplaceStatus) {
    const statusMap = {
      // Shopee
      'UNPAID': 'PENDING',
      'TO_SHIP': 'CONFIRMED',
      'SHIPPED': 'SHIPPED',
      'TO_CONFIRM_RECEIVE': 'SHIPPED',
      'COMPLETED': 'DELIVERED',
      'CANCELLED': 'CANCELLED',
      'INVOICE_PENDING': 'PENDING',
      
      // Tokopedia
      'new': 'PENDING',
      'processed': 'PROCESSING',
      'sent': 'SHIPPED',
      'delivered': 'DELIVERED',
      'cancelled': 'CANCELLED',
      
      // Lazada
      'pending': 'PENDING',
      'packed': 'PROCESSING',
      'ready_to_ship': 'CONFIRMED',
      'shipped': 'SHIPPED',
      'delivered': 'DELIVERED',
      'canceled': 'CANCELLED',
      'returned': 'REFUNDED'
    };

    return statusMap[marketplaceStatus] || 'PENDING';
  }

  /**
   * Apply automation rules to order
   */
  async applyAutomationRules(order) {
    try {
      const userRules = this.automationRules.get(order.userId) || [];
      
      for (const rule of userRules) {
        if (await this.evaluateRuleConditions(rule, order)) {
          await this.executeRuleActions(rule, order);
        }
      }

    } catch (error) {
      logger.error(`Failed to apply automation rules for order ${order.id}:`, error);
    }
  }

  /**
   * Evaluate rule conditions
   */
  async evaluateRuleConditions(rule, order) {
    try {
      for (const condition of rule.conditions) {
        const result = await this.evaluateCondition(condition, order);
        if (!result) {
          return false; // All conditions must be true
        }
      }
      return true;
    } catch (error) {
      logger.error('Failed to evaluate rule conditions:', error);
      return false;
    }
  }

  /**
   * Evaluate single condition
   */
  async evaluateCondition(condition, order) {
    const { field, operator, value } = condition;
    
    let orderValue;
    switch (field) {
      case 'status':
        orderValue = order.status;
        break;
      case 'totalAmount':
        orderValue = order.totalAmount;
        break;
      case 'marketplace':
        orderValue = order.marketplaceAccount?.marketplace?.code;
        break;
      case 'customerEmail':
        orderValue = order.customerInfo?.email;
        break;
      default:
        return false;
    }

    switch (operator) {
      case 'equals':
        return orderValue === value;
      case 'not_equals':
        return orderValue !== value;
      case 'greater_than':
        return parseFloat(orderValue) > parseFloat(value);
      case 'less_than':
        return parseFloat(orderValue) < parseFloat(value);
      case 'contains':
        return orderValue?.toString().includes(value);
      default:
        return false;
    }
  }

  /**
   * Execute rule actions
   */
  async executeRuleActions(rule, order) {
    try {
      for (const action of rule.actions) {
        await this.executeAction(action, order);
      }
    } catch (error) {
      logger.error('Failed to execute rule actions:', error);
    }
  }

  /**
   * Execute single action
   */
  async executeAction(action, order) {
    const { actionType, actionValue } = action;

    switch (actionType) {
      case 'update_status':
        await this.updateOrderStatus(order.id, actionValue, 'AUTOMATION');
        break;
      case 'add_tag':
        await this.addOrderTag(order.id, actionValue);
        break;
      case 'send_notification':
        await this.sendOrderNotification(order, actionValue);
        break;
      case 'assign_to_user':
        await this.assignOrderToUser(order.id, actionValue);
        break;
      default:
        logger.warn(`Unknown action type: ${actionType}`);
    }
  }

  /**
   * Monitor order statuses for changes
   */
  async monitorOrderStatuses() {
    try {
      // Get orders that might need status updates
      const ordersToCheck = await prisma.order.findMany({
        where: {
          status: {
            in: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED']
          },
          updatedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        },
        include: {
          marketplaceAccount: {
            include: { marketplace: true }
          }
        },
        take: 100 // Limit batch size
      });

      for (const order of ordersToCheck) {
        try {
          await this.checkOrderStatusUpdate(order);
        } catch (error) {
          logger.error(`Failed to check status for order ${order.id}:`, error);
        }
      }

    } catch (error) {
      logger.error('Error in order status monitoring:', error);
    }
  }

  /**
   * Check if order status needs update
   */
  async checkOrderStatusUpdate(order) {
    try {
      const integration = MarketplaceFactory.createFromAccount(order.marketplaceAccount);
      const marketplaceOrder = await integration.getOrder(order.marketplaceOrderId);
      
      const currentStatus = this.normalizeOrderStatus(marketplaceOrder.status);
      
      if (currentStatus !== order.status) {
        await this.updateOrderStatus(order.id, currentStatus, 'SYSTEM');
        
        // Emit real-time update
        this.emitOrderUpdate(order.userId, {
          type: 'order-status-changed',
          orderId: order.id,
          oldStatus: order.status,
          newStatus: currentStatus
        });
      }

    } catch (error) {
      logger.error(`Failed to check order status update:`, error);
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId, newStatus, changedBy, reason = '') {
    return await transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId }
      });

      if (!order) {
        throw new Error('Order not found');
      }

      const oldStatus = order.status;

      // Update order
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: newStatus,
          updatedAt: new Date()
        }
      });

      // Create status history
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: newStatus,
          previousStatus: oldStatus,
          changedBy,
          reason: reason || `Status changed from ${oldStatus} to ${newStatus}`,
          changedAt: new Date()
        }
      });

      return updatedOrder;
    });
  }

  /**
   * Emit real-time order update
   */
  emitOrderUpdate(userId, data) {
    if (io) {
      io.to(`user-${userId}`).emit('order-update', data);
    }
  }

  /**
   * Emit order sync update
   */
  emitOrderSyncUpdate(userId, data) {
    if (io) {
      io.to(`user-${userId}`).emit('order-sync-update', data);
    }
  }
}

// Create singleton instance
const orderManagementService = new OrderManagementService();

module.exports = orderManagementService;
