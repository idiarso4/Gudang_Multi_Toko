const { prisma, transaction } = require('../utils/database');
const MarketplaceFactory = require('../integrations/MarketplaceFactory');
const { addInventoryJob } = require('../jobs/queueManager');
const logger = require('../utils/logger');
const { io } = require('../server');

/**
 * Stock Synchronization Service
 * Handles automatic stock synchronization across marketplaces
 */
class StockSyncService {
  constructor() {
    this.syncInProgress = new Set(); // Track ongoing syncs
    this.syncRules = new Map(); // Cache sync rules
  }

  /**
   * Initialize stock sync service
   */
  async initialize() {
    logger.info('Initializing Stock Sync Service...');
    
    // Load sync rules from database
    await this.loadSyncRules();
    
    // Setup periodic sync check
    this.setupPeriodicSync();
    
    logger.info('Stock Sync Service initialized');
  }

  /**
   * Load sync rules from database
   */
  async loadSyncRules() {
    try {
      const rules = await prisma.stockSyncRule.findMany({
        where: { isActive: true },
        include: {
          user: true,
          sourceMarketplaceAccount: {
            include: { marketplace: true }
          },
          targetMarketplaceAccounts: {
            include: { 
              marketplaceAccount: {
                include: { marketplace: true }
              }
            }
          }
        }
      });

      this.syncRules.clear();
      rules.forEach(rule => {
        this.syncRules.set(rule.id, rule);
      });

      logger.info(`Loaded ${rules.length} sync rules`);
    } catch (error) {
      logger.error('Failed to load sync rules:', error);
    }
  }

  /**
   * Setup periodic sync check (every 5 minutes)
   */
  setupPeriodicSync() {
    setInterval(async () => {
      await this.checkAndSyncPendingUpdates();
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Trigger stock sync when inventory changes
   */
  async onInventoryChange(inventoryUpdate) {
    try {
      const { productId, variantId, userId, oldStock, newStock, reason } = inventoryUpdate;

      logger.info(`Inventory change detected: Product ${productId}, Old: ${oldStock}, New: ${newStock}`);

      // Find applicable sync rules
      const applicableRules = await this.findApplicableSyncRules(userId, productId);

      if (applicableRules.length === 0) {
        logger.debug(`No sync rules found for product ${productId}`);
        return;
      }

      // Process each applicable rule
      for (const rule of applicableRules) {
        await this.processSyncRule(rule, {
          productId,
          variantId,
          newStock,
          reason: reason || 'Inventory update'
        });
      }

    } catch (error) {
      logger.error('Error in onInventoryChange:', error);
    }
  }

  /**
   * Find applicable sync rules for a product
   */
  async findApplicableSyncRules(userId, productId) {
    try {
      const rules = await prisma.stockSyncRule.findMany({
        where: {
          userId,
          isActive: true,
          OR: [
            { syncScope: 'ALL_PRODUCTS' },
            {
              syncScope: 'SPECIFIC_PRODUCTS',
              productIds: {
                has: productId
              }
            },
            {
              syncScope: 'CATEGORY',
              categoryIds: {
                in: await this.getProductCategoryIds(productId)
              }
            }
          ]
        },
        include: {
          sourceMarketplaceAccount: {
            include: { marketplace: true }
          },
          targetMarketplaceAccounts: {
            include: { 
              marketplaceAccount: {
                include: { marketplace: true }
              }
            }
          }
        }
      });

      return rules;
    } catch (error) {
      logger.error('Error finding applicable sync rules:', error);
      return [];
    }
  }

  /**
   * Get product category IDs
   */
  async getProductCategoryIds(productId) {
    try {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { categoryId: true }
      });

      return product?.categoryId ? [product.categoryId] : [];
    } catch (error) {
      logger.error('Error getting product category IDs:', error);
      return [];
    }
  }

  /**
   * Process a sync rule
   */
  async processSyncRule(rule, inventoryData) {
    const { productId, variantId, newStock, reason } = inventoryData;
    const syncKey = `${rule.id}-${productId}-${variantId || 'main'}`;

    // Prevent duplicate syncs
    if (this.syncInProgress.has(syncKey)) {
      logger.debug(`Sync already in progress for ${syncKey}`);
      return;
    }

    this.syncInProgress.add(syncKey);

    try {
      logger.info(`Processing sync rule ${rule.id} for product ${productId}`);

      // Calculate target stock based on rule
      const targetStock = await this.calculateTargetStock(rule, newStock, inventoryData);

      // Get marketplace product mappings
      const marketplaceProducts = await this.getMarketplaceProducts(productId, variantId);

      // Sync to target marketplaces
      const syncResults = [];
      
      for (const target of rule.targetMarketplaceAccounts) {
        const marketplaceAccount = target.marketplaceAccount;
        const marketplaceProduct = marketplaceProducts.find(
          mp => mp.marketplaceAccountId === marketplaceAccount.id
        );

        if (!marketplaceProduct) {
          logger.warn(`Product ${productId} not found in marketplace ${marketplaceAccount.marketplace.name}`);
          continue;
        }

        try {
          const result = await this.syncToMarketplace(
            marketplaceAccount,
            marketplaceProduct,
            targetStock,
            reason
          );

          syncResults.push({
            marketplaceAccountId: marketplaceAccount.id,
            marketplaceName: marketplaceAccount.marketplace.name,
            success: result.success,
            newStock: targetStock,
            error: result.error
          });

        } catch (error) {
          logger.error(`Failed to sync to ${marketplaceAccount.marketplace.name}:`, error);
          syncResults.push({
            marketplaceAccountId: marketplaceAccount.id,
            marketplaceName: marketplaceAccount.marketplace.name,
            success: false,
            error: error.message
          });
        }
      }

      // Log sync activity
      await this.logSyncActivity(rule, productId, variantId, syncResults);

      // Emit real-time update
      this.emitSyncUpdate(rule.userId, {
        type: 'stock-sync-completed',
        ruleId: rule.id,
        productId,
        variantId,
        results: syncResults
      });

      logger.info(`Sync rule ${rule.id} completed with ${syncResults.filter(r => r.success).length}/${syncResults.length} successful syncs`);

    } catch (error) {
      logger.error(`Error processing sync rule ${rule.id}:`, error);
      
      // Emit error update
      this.emitSyncUpdate(rule.userId, {
        type: 'stock-sync-failed',
        ruleId: rule.id,
        productId,
        variantId,
        error: error.message
      });

    } finally {
      this.syncInProgress.delete(syncKey);
    }
  }

  /**
   * Calculate target stock based on sync rule
   */
  async calculateTargetStock(rule, sourceStock, inventoryData) {
    switch (rule.syncStrategy) {
      case 'EXACT_MATCH':
        return sourceStock;
        
      case 'PERCENTAGE':
        return Math.floor(sourceStock * (rule.syncPercentage / 100));
        
      case 'FIXED_OFFSET':
        return Math.max(0, sourceStock + rule.syncOffset);
        
      case 'MINIMUM_THRESHOLD':
        return Math.max(rule.minimumStock, sourceStock);
        
      case 'CUSTOM_FORMULA':
        return await this.applyCustomFormula(rule.customFormula, sourceStock, inventoryData);
        
      default:
        return sourceStock;
    }
  }

  /**
   * Apply custom formula for stock calculation
   */
  async applyCustomFormula(formula, sourceStock, inventoryData) {
    try {
      // Simple formula parser - in production, use a proper expression evaluator
      // Formula examples: "stock * 0.8", "stock - 5", "max(stock - 10, 0)"
      
      const context = {
        stock: sourceStock,
        ...inventoryData
      };

      // Basic formula evaluation (replace with proper parser in production)
      let result = formula
        .replace(/stock/g, sourceStock)
        .replace(/max\(([^,]+),\s*([^)]+)\)/g, (match, a, b) => {
          return Math.max(eval(a), eval(b));
        });

      return Math.max(0, Math.floor(eval(result)));
    } catch (error) {
      logger.error('Error applying custom formula:', error);
      return sourceStock; // Fallback to exact match
    }
  }

  /**
   * Get marketplace product mappings
   */
  async getMarketplaceProducts(productId, variantId) {
    return await prisma.marketplaceProduct.findMany({
      where: {
        productId,
        variantId: variantId || null,
        syncStatus: 'SUCCESS'
      },
      include: {
        marketplaceAccount: {
          include: { marketplace: true }
        }
      }
    });
  }

  /**
   * Sync stock to specific marketplace
   */
  async syncToMarketplace(marketplaceAccount, marketplaceProduct, targetStock, reason) {
    try {
      // Create marketplace integration
      const integration = MarketplaceFactory.createFromAccount(marketplaceAccount);

      // Update stock in marketplace
      const result = await integration.updateStock(
        marketplaceProduct.marketplaceProductId,
        targetStock,
        marketplaceProduct.variantId
      );

      // Update local record
      await prisma.marketplaceProduct.update({
        where: { id: marketplaceProduct.id },
        data: {
          lastSynced: new Date(),
          syncStatus: 'SUCCESS'
        }
      });

      return {
        success: true,
        data: result
      };

    } catch (error) {
      // Update local record with error
      await prisma.marketplaceProduct.update({
        where: { id: marketplaceProduct.id },
        data: {
          lastSynced: new Date(),
          syncStatus: 'FAILED'
        }
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Log sync activity
   */
  async logSyncActivity(rule, productId, variantId, results) {
    try {
      await prisma.stockSyncLog.create({
        data: {
          ruleId: rule.id,
          productId,
          variantId,
          userId: rule.userId,
          syncResults: results,
          successCount: results.filter(r => r.success).length,
          failureCount: results.filter(r => !r.success).length,
          syncedAt: new Date()
        }
      });
    } catch (error) {
      logger.error('Error logging sync activity:', error);
    }
  }

  /**
   * Emit real-time sync update
   */
  emitSyncUpdate(userId, data) {
    if (io) {
      io.to(`user-${userId}`).emit('stock-sync-update', data);
    }
  }

  /**
   * Check and sync pending updates
   */
  async checkAndSyncPendingUpdates() {
    try {
      // Find inventory items that need sync
      const pendingUpdates = await prisma.inventory.findMany({
        where: {
          lastUpdated: {
            gte: new Date(Date.now() - 10 * 60 * 1000) // Last 10 minutes
          },
          product: {
            isActive: true
          }
        },
        include: {
          product: {
            select: {
              id: true,
              userId: true,
              name: true,
              sku: true
            }
          },
          variant: {
            select: {
              id: true,
              sku: true
            }
          }
        },
        take: 100 // Limit batch size
      });

      logger.info(`Found ${pendingUpdates.length} pending inventory updates`);

      for (const update of pendingUpdates) {
        await this.onInventoryChange({
          productId: update.productId,
          variantId: update.variantId,
          userId: update.product.userId,
          oldStock: update.stockQuantity, // We don't have old stock here, using current
          newStock: update.stockQuantity,
          reason: 'Periodic sync check'
        });
      }

    } catch (error) {
      logger.error('Error in checkAndSyncPendingUpdates:', error);
    }
  }

  /**
   * Manual sync trigger
   */
  async triggerManualSync(userId, productIds, options = {}) {
    try {
      logger.info(`Manual sync triggered by user ${userId} for ${productIds.length} products`);

      const results = [];

      for (const productId of productIds) {
        // Get current inventory
        const inventory = await prisma.inventory.findMany({
          where: { productId },
          include: {
            product: true,
            variant: true
          }
        });

        for (const item of inventory) {
          await this.onInventoryChange({
            productId: item.productId,
            variantId: item.variantId,
            userId,
            oldStock: item.stockQuantity,
            newStock: item.stockQuantity,
            reason: options.reason || 'Manual sync'
          });

          results.push({
            productId: item.productId,
            variantId: item.variantId,
            status: 'queued'
          });
        }
      }

      return {
        success: true,
        message: `Sync queued for ${results.length} inventory items`,
        results
      };

    } catch (error) {
      logger.error('Error in triggerManualSync:', error);
      throw error;
    }
  }

  /**
   * Get sync statistics
   */
  async getSyncStats(userId, timeRange = '24h') {
    try {
      const timeRangeMap = {
        '1h': 1,
        '24h': 24,
        '7d': 24 * 7,
        '30d': 24 * 30
      };

      const hours = timeRangeMap[timeRange] || 24;
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

      const stats = await prisma.stockSyncLog.aggregate({
        where: {
          userId,
          syncedAt: { gte: startTime }
        },
        _sum: {
          successCount: true,
          failureCount: true
        },
        _count: {
          id: true
        }
      });

      return {
        totalSyncs: stats._count.id || 0,
        successfulSyncs: stats._sum.successCount || 0,
        failedSyncs: stats._sum.failureCount || 0,
        successRate: stats._sum.successCount > 0 
          ? ((stats._sum.successCount / (stats._sum.successCount + stats._sum.failureCount)) * 100).toFixed(2)
          : 0,
        timeRange
      };

    } catch (error) {
      logger.error('Error getting sync stats:', error);
      throw error;
    }
  }
}

// Create singleton instance
const stockSyncService = new StockSyncService();

module.exports = stockSyncService;
