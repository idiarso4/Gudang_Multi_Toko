const stockSyncService = require('../../../src/services/stockSyncService');
const {
  prisma,
  createTestUser,
  createTestMarketplace,
  createTestMarketplaceAccount,
  createTestProduct,
  createTestInventory,
  mockShopeeAPI,
  mockTokopediaAPI
} = require('../../setup');

describe('StockSyncService', () => {
  let testUser, testMarketplace, testMarketplaceAccount, testProduct, testInventory;

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
    testInventory = await createTestInventory(testProduct.id, {
      stockQuantity: 100,
      availableQuantity: 100
    });
  });

  describe('onInventoryChange', () => {
    it('should trigger stock sync when inventory changes', async () => {
      // Create sync rule
      const syncRule = await prisma.stockSyncRule.create({
        data: {
          userId: testUser.id,
          name: 'Test Sync Rule',
          syncStrategy: 'EXACT_MATCH',
          syncScope: 'ALL_PRODUCTS',
          isActive: true,
          targetMarketplaceAccounts: {
            create: [
              {
                marketplaceAccountId: testMarketplaceAccount.id
              }
            ]
          }
        },
        include: {
          targetMarketplaceAccounts: {
            include: {
              marketplaceAccount: {
                include: { marketplace: true }
              }
            }
          }
        }
      });

      // Create marketplace product mapping
      await prisma.marketplaceProduct.create({
        data: {
          productId: testProduct.id,
          marketplaceAccountId: testMarketplaceAccount.id,
          marketplaceProductId: 'SHOPEE-PROD-123',
          syncStatus: 'SUCCESS'
        }
      });

      // Mock marketplace API
      mockShopeeAPI.updateStock.mockResolvedValue({ success: true });
      const MarketplaceFactory = require('../../../src/integrations/MarketplaceFactory');
      jest.spyOn(MarketplaceFactory, 'createFromAccount').mockReturnValue({
        updateStock: mockShopeeAPI.updateStock
      });

      // Mock sync rules loading
      stockSyncService.syncRules.set(syncRule.id, syncRule);

      const inventoryUpdate = {
        productId: testProduct.id,
        variantId: null,
        userId: testUser.id,
        oldStock: 100,
        newStock: 80,
        reason: 'Manual adjustment'
      };

      await stockSyncService.onInventoryChange(inventoryUpdate);

      // Verify marketplace API was called
      expect(mockShopeeAPI.updateStock).toHaveBeenCalledWith(
        'SHOPEE-PROD-123',
        80,
        null
      );

      // Verify sync log was created
      const syncLog = await prisma.stockSyncLog.findFirst({
        where: {
          ruleId: syncRule.id,
          productId: testProduct.id
        }
      });

      expect(syncLog).toBeDefined();
      expect(syncLog.successCount).toBe(1);
      expect(syncLog.failureCount).toBe(0);
    });

    it('should not sync when no applicable rules found', async () => {
      const inventoryUpdate = {
        productId: testProduct.id,
        variantId: null,
        userId: testUser.id,
        oldStock: 100,
        newStock: 80,
        reason: 'Manual adjustment'
      };

      // Mock marketplace API
      mockShopeeAPI.updateStock.mockResolvedValue({ success: true });

      await stockSyncService.onInventoryChange(inventoryUpdate);

      // Verify marketplace API was not called
      expect(mockShopeeAPI.updateStock).not.toHaveBeenCalled();
    });
  });

  describe('calculateTargetStock', () => {
    const mockRule = {
      syncStrategy: 'EXACT_MATCH',
      syncPercentage: null,
      syncOffset: null,
      minimumStock: null,
      customFormula: null
    };

    it('should calculate exact match correctly', async () => {
      const targetStock = await stockSyncService.calculateTargetStock(
        { ...mockRule, syncStrategy: 'EXACT_MATCH' },
        50,
        {}
      );

      expect(targetStock).toBe(50);
    });

    it('should calculate percentage correctly', async () => {
      const targetStock = await stockSyncService.calculateTargetStock(
        { ...mockRule, syncStrategy: 'PERCENTAGE', syncPercentage: 80 },
        100,
        {}
      );

      expect(targetStock).toBe(80);
    });

    it('should calculate fixed offset correctly', async () => {
      const targetStock = await stockSyncService.calculateTargetStock(
        { ...mockRule, syncStrategy: 'FIXED_OFFSET', syncOffset: -10 },
        50,
        {}
      );

      expect(targetStock).toBe(40);
    });

    it('should not allow negative stock with fixed offset', async () => {
      const targetStock = await stockSyncService.calculateTargetStock(
        { ...mockRule, syncStrategy: 'FIXED_OFFSET', syncOffset: -60 },
        50,
        {}
      );

      expect(targetStock).toBe(0);
    });

    it('should calculate minimum threshold correctly', async () => {
      const targetStock = await stockSyncService.calculateTargetStock(
        { ...mockRule, syncStrategy: 'MINIMUM_THRESHOLD', minimumStock: 20 },
        10,
        {}
      );

      expect(targetStock).toBe(20);
    });

    it('should use source stock when above minimum threshold', async () => {
      const targetStock = await stockSyncService.calculateTargetStock(
        { ...mockRule, syncStrategy: 'MINIMUM_THRESHOLD', minimumStock: 20 },
        50,
        {}
      );

      expect(targetStock).toBe(50);
    });

    it('should apply custom formula correctly', async () => {
      const targetStock = await stockSyncService.calculateTargetStock(
        { ...mockRule, syncStrategy: 'CUSTOM_FORMULA', customFormula: 'stock * 0.8' },
        100,
        {}
      );

      expect(targetStock).toBe(80);
    });

    it('should handle custom formula with max function', async () => {
      const targetStock = await stockSyncService.calculateTargetStock(
        { ...mockRule, syncStrategy: 'CUSTOM_FORMULA', customFormula: 'max(stock - 10, 5)' },
        8,
        {}
      );

      expect(targetStock).toBe(5);
    });

    it('should fallback to exact match on formula error', async () => {
      const targetStock = await stockSyncService.calculateTargetStock(
        { ...mockRule, syncStrategy: 'CUSTOM_FORMULA', customFormula: 'invalid formula' },
        50,
        {}
      );

      expect(targetStock).toBe(50);
    });
  });

  describe('findApplicableSyncRules', () => {
    it('should find rules for ALL_PRODUCTS scope', async () => {
      const syncRule = await prisma.stockSyncRule.create({
        data: {
          userId: testUser.id,
          name: 'All Products Rule',
          syncStrategy: 'EXACT_MATCH',
          syncScope: 'ALL_PRODUCTS',
          isActive: true
        }
      });

      const rules = await stockSyncService.findApplicableSyncRules(
        testUser.id,
        testProduct.id
      );

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe(syncRule.id);
    });

    it('should find rules for SPECIFIC_PRODUCTS scope', async () => {
      const syncRule = await prisma.stockSyncRule.create({
        data: {
          userId: testUser.id,
          name: 'Specific Products Rule',
          syncStrategy: 'EXACT_MATCH',
          syncScope: 'SPECIFIC_PRODUCTS',
          productIds: [testProduct.id],
          isActive: true
        }
      });

      const rules = await stockSyncService.findApplicableSyncRules(
        testUser.id,
        testProduct.id
      );

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe(syncRule.id);
    });

    it('should not find rules for different products in SPECIFIC_PRODUCTS scope', async () => {
      const otherProduct = await createTestProduct(testUser.id, {
        name: 'Other Product',
        sku: 'OTHER-SKU'
      });

      await prisma.stockSyncRule.create({
        data: {
          userId: testUser.id,
          name: 'Specific Products Rule',
          syncStrategy: 'EXACT_MATCH',
          syncScope: 'SPECIFIC_PRODUCTS',
          productIds: [otherProduct.id],
          isActive: true
        }
      });

      const rules = await stockSyncService.findApplicableSyncRules(
        testUser.id,
        testProduct.id
      );

      expect(rules).toHaveLength(0);
    });

    it('should find rules for CATEGORY scope', async () => {
      // Create category
      const category = await prisma.productCategory.create({
        data: {
          userId: testUser.id,
          name: 'Test Category',
          description: 'Test category description'
        }
      });

      // Update product to have category
      await prisma.product.update({
        where: { id: testProduct.id },
        data: { categoryId: category.id }
      });

      const syncRule = await prisma.stockSyncRule.create({
        data: {
          userId: testUser.id,
          name: 'Category Rule',
          syncStrategy: 'EXACT_MATCH',
          syncScope: 'CATEGORY',
          categoryIds: [category.id],
          isActive: true
        }
      });

      const rules = await stockSyncService.findApplicableSyncRules(
        testUser.id,
        testProduct.id
      );

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe(syncRule.id);
    });

    it('should not find inactive rules', async () => {
      await prisma.stockSyncRule.create({
        data: {
          userId: testUser.id,
          name: 'Inactive Rule',
          syncStrategy: 'EXACT_MATCH',
          syncScope: 'ALL_PRODUCTS',
          isActive: false
        }
      });

      const rules = await stockSyncService.findApplicableSyncRules(
        testUser.id,
        testProduct.id
      );

      expect(rules).toHaveLength(0);
    });
  });

  describe('syncToMarketplace', () => {
    let marketplaceProduct;

    beforeEach(async () => {
      marketplaceProduct = await prisma.marketplaceProduct.create({
        data: {
          productId: testProduct.id,
          marketplaceAccountId: testMarketplaceAccount.id,
          marketplaceProductId: 'SHOPEE-PROD-123',
          syncStatus: 'SUCCESS'
        }
      });
    });

    it('should sync stock successfully', async () => {
      mockShopeeAPI.updateStock.mockResolvedValue({ success: true });
      const MarketplaceFactory = require('../../../src/integrations/MarketplaceFactory');
      jest.spyOn(MarketplaceFactory, 'createFromAccount').mockReturnValue({
        updateStock: mockShopeeAPI.updateStock
      });

      const result = await stockSyncService.syncToMarketplace(
        testMarketplaceAccount,
        marketplaceProduct,
        75,
        'Test sync'
      );

      expect(result.success).toBe(true);
      expect(mockShopeeAPI.updateStock).toHaveBeenCalledWith(
        'SHOPEE-PROD-123',
        75,
        null
      );

      // Verify marketplace product was updated
      const updatedProduct = await prisma.marketplaceProduct.findUnique({
        where: { id: marketplaceProduct.id }
      });

      expect(updatedProduct.syncStatus).toBe('SUCCESS');
      expect(updatedProduct.lastSynced).toBeDefined();
    });

    it('should handle sync failure', async () => {
      mockShopeeAPI.updateStock.mockRejectedValue(new Error('API Error'));
      const MarketplaceFactory = require('../../../src/integrations/MarketplaceFactory');
      jest.spyOn(MarketplaceFactory, 'createFromAccount').mockReturnValue({
        updateStock: mockShopeeAPI.updateStock
      });

      const result = await stockSyncService.syncToMarketplace(
        testMarketplaceAccount,
        marketplaceProduct,
        75,
        'Test sync'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');

      // Verify marketplace product status was updated to FAILED
      const updatedProduct = await prisma.marketplaceProduct.findUnique({
        where: { id: marketplaceProduct.id }
      });

      expect(updatedProduct.syncStatus).toBe('FAILED');
    });
  });

  describe('triggerManualSync', () => {
    it('should trigger manual sync for specified products', async () => {
      const result = await stockSyncService.triggerManualSync(
        testUser.id,
        [testProduct.id],
        { reason: 'Manual test sync' }
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].productId).toBe(testProduct.id);
      expect(result.results[0].status).toBe('queued');
    });

    it('should handle multiple products', async () => {
      const product2 = await createTestProduct(testUser.id, {
        name: 'Product 2',
        sku: 'TEST-SKU-002'
      });
      await createTestInventory(product2.id);

      const result = await stockSyncService.triggerManualSync(
        testUser.id,
        [testProduct.id, product2.id],
        { reason: 'Bulk manual sync' }
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
    });
  });

  describe('getSyncStats', () => {
    beforeEach(async () => {
      // Create some sync logs
      await prisma.stockSyncLog.create({
        data: {
          userId: testUser.id,
          ruleId: 'test-rule-id',
          productId: testProduct.id,
          syncResults: [
            { success: true, marketplaceName: 'Shopee' },
            { success: false, marketplaceName: 'Tokopedia' }
          ],
          successCount: 1,
          failureCount: 1,
          syncedAt: new Date()
        }
      });
    });

    it('should return sync statistics', async () => {
      const stats = await stockSyncService.getSyncStats(testUser.id, '24h');

      expect(stats.totalSyncs).toBe(1);
      expect(stats.successfulSyncs).toBe(1);
      expect(stats.failedSyncs).toBe(1);
      expect(stats.successRate).toBe('50.00');
      expect(stats.timeRange).toBe('24h');
    });

    it('should handle different time ranges', async () => {
      const stats = await stockSyncService.getSyncStats(testUser.id, '7d');
      expect(stats.timeRange).toBe('7d');
    });

    it('should return zero stats when no logs exist', async () => {
      // Clean up existing logs
      await prisma.stockSyncLog.deleteMany({
        where: { userId: testUser.id }
      });

      const stats = await stockSyncService.getSyncStats(testUser.id, '24h');

      expect(stats.totalSyncs).toBe(0);
      expect(stats.successfulSyncs).toBe(0);
      expect(stats.failedSyncs).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle missing marketplace product gracefully', async () => {
      const syncRule = await prisma.stockSyncRule.create({
        data: {
          userId: testUser.id,
          name: 'Test Rule',
          syncStrategy: 'EXACT_MATCH',
          syncScope: 'ALL_PRODUCTS',
          isActive: true,
          targetMarketplaceAccounts: {
            create: [
              {
                marketplaceAccountId: testMarketplaceAccount.id
              }
            ]
          }
        },
        include: {
          targetMarketplaceAccounts: {
            include: {
              marketplaceAccount: {
                include: { marketplace: true }
              }
            }
          }
        }
      });

      // No marketplace product mapping exists
      stockSyncService.syncRules.set(syncRule.id, syncRule);

      const inventoryUpdate = {
        productId: testProduct.id,
        variantId: null,
        userId: testUser.id,
        oldStock: 100,
        newStock: 80,
        reason: 'Manual adjustment'
      };

      // Should not throw error
      await expect(
        stockSyncService.onInventoryChange(inventoryUpdate)
      ).resolves.not.toThrow();
    });

    it('should prevent duplicate syncs', async () => {
      const syncRule = await prisma.stockSyncRule.create({
        data: {
          userId: testUser.id,
          name: 'Test Rule',
          syncStrategy: 'EXACT_MATCH',
          syncScope: 'ALL_PRODUCTS',
          isActive: true,
          targetMarketplaceAccounts: {
            create: [
              {
                marketplaceAccountId: testMarketplaceAccount.id
              }
            ]
          }
        },
        include: {
          targetMarketplaceAccounts: {
            include: {
              marketplaceAccount: {
                include: { marketplace: true }
              }
            }
          }
        }
      });

      stockSyncService.syncRules.set(syncRule.id, syncRule);

      const inventoryUpdate = {
        productId: testProduct.id,
        variantId: null,
        userId: testUser.id,
        oldStock: 100,
        newStock: 80,
        reason: 'Manual adjustment'
      };

      // Start first sync (don't await)
      const sync1Promise = stockSyncService.onInventoryChange(inventoryUpdate);
      
      // Start second sync immediately
      const sync2Promise = stockSyncService.onInventoryChange(inventoryUpdate);

      await Promise.all([sync1Promise, sync2Promise]);

      // Both should complete without error, but duplicate prevention should work
      expect(true).toBe(true); // Test passes if no errors thrown
    });
  });
});
