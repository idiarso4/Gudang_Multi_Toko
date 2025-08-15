const ShopeeIntegration = require('./ShopeeIntegration');
const TokopediaIntegration = require('./TokopediaIntegration');
const LazadaIntegration = require('./LazadaIntegration');
const logger = require('../utils/logger');

/**
 * Factory class for creating marketplace integration instances
 */
class MarketplaceFactory {
  static integrations = {
    'SHOPEE': ShopeeIntegration,
    'TOKOPEDIA': TokopediaIntegration,
    'LAZADA': LazadaIntegration,
    // Add more marketplaces here as they are implemented
    'BLIBLI': null, // TODO: Implement BlibliIntegration
    'BUKALAPAK': null, // TODO: Implement BukalapakIntegration
    'JDID': null, // TODO: Implement JDIDIntegration
    'TIKTOK': null, // TODO: Implement TikTokIntegration
    'WOOCOMMERCE': null, // TODO: Implement WooCommerceIntegration
    'SHOPIFY': null // TODO: Implement ShopifyIntegration
  };

  /**
   * Create marketplace integration instance
   * @param {string} marketplaceCode - Marketplace code (e.g., 'SHOPEE', 'TOKOPEDIA')
   * @param {Object} config - Configuration object containing API credentials
   * @returns {BaseMarketplace} Marketplace integration instance
   */
  static create(marketplaceCode, config) {
    const IntegrationClass = this.integrations[marketplaceCode.toUpperCase()];
    
    if (!IntegrationClass) {
      throw new Error(`Marketplace integration not implemented: ${marketplaceCode}`);
    }

    try {
      return new IntegrationClass(config);
    } catch (error) {
      logger.error(`Failed to create ${marketplaceCode} integration:`, error);
      throw new Error(`Failed to initialize ${marketplaceCode} integration: ${error.message}`);
    }
  }

  /**
   * Create integration from marketplace account data
   * @param {Object} marketplaceAccount - User marketplace account from database
   * @returns {BaseMarketplace} Marketplace integration instance
   */
  static createFromAccount(marketplaceAccount) {
    const { marketplace, apiKey, apiSecret, credentials } = marketplaceAccount;
    
    if (!marketplace || !marketplace.code) {
      throw new Error('Invalid marketplace account: missing marketplace information');
    }

    // Build configuration object
    const config = {
      apiKey,
      apiSecret,
      ...credentials // Spread any additional credentials from JSON field
    };

    // Add marketplace-specific configuration
    switch (marketplace.code.toUpperCase()) {
      case 'SHOPEE':
        config.partnerId = credentials?.partnerId;
        config.shopId = marketplaceAccount.shopId || credentials?.shopId;
        config.accessToken = credentials?.accessToken;
        break;
        
      case 'TOKOPEDIA':
        config.fsId = credentials?.fsId;
        config.clientId = apiKey;
        config.clientSecret = apiSecret;
        config.accessToken = credentials?.accessToken;
        break;
        
      case 'LAZADA':
        config.appKey = apiKey;
        config.appSecret = apiSecret;
        config.accessToken = credentials?.accessToken;
        break;
        
      default:
        // For other marketplaces, use generic configuration
        break;
    }

    return this.create(marketplace.code, config);
  }

  /**
   * Get list of supported marketplaces
   * @returns {Array} Array of supported marketplace codes
   */
  static getSupportedMarketplaces() {
    return Object.keys(this.integrations).filter(code => this.integrations[code] !== null);
  }

  /**
   * Check if marketplace is supported
   * @param {string} marketplaceCode - Marketplace code to check
   * @returns {boolean} True if marketplace is supported
   */
  static isSupported(marketplaceCode) {
    return this.integrations[marketplaceCode.toUpperCase()] !== null;
  }

  /**
   * Register new marketplace integration
   * @param {string} marketplaceCode - Marketplace code
   * @param {Class} IntegrationClass - Integration class that extends BaseMarketplace
   */
  static register(marketplaceCode, IntegrationClass) {
    this.integrations[marketplaceCode.toUpperCase()] = IntegrationClass;
    logger.info(`Registered marketplace integration: ${marketplaceCode}`);
  }

  /**
   * Test connection for multiple marketplace accounts
   * @param {Array} marketplaceAccounts - Array of marketplace accounts
   * @returns {Array} Array of test results
   */
  static async testConnections(marketplaceAccounts) {
    const results = [];

    for (const account of marketplaceAccounts) {
      try {
        const integration = this.createFromAccount(account);
        const testResult = await integration.testConnection();
        
        results.push({
          accountId: account.id,
          marketplace: account.marketplace.name,
          success: testResult.success,
          message: testResult.message,
          data: testResult.data
        });
      } catch (error) {
        results.push({
          accountId: account.id,
          marketplace: account.marketplace?.name || 'Unknown',
          success: false,
          message: error.message,
          error: error
        });
      }
    }

    return results;
  }

  /**
   * Sync products across multiple marketplaces
   * @param {Array} products - Array of products to sync
   * @param {Array} marketplaceAccounts - Array of marketplace accounts
   * @returns {Array} Array of sync results
   */
  static async syncProducts(products, marketplaceAccounts) {
    const results = [];

    for (const account of marketplaceAccounts) {
      try {
        const integration = this.createFromAccount(account);
        
        for (const product of products) {
          try {
            // Check if product already exists in marketplace
            const existingProduct = await this.findExistingProduct(integration, product, account);
            
            let result;
            if (existingProduct) {
              // Update existing product
              result = await integration.updateProduct(existingProduct.marketplaceProductId, product);
            } else {
              // Create new product
              result = await integration.createProduct(product);
            }

            results.push({
              productId: product.id,
              accountId: account.id,
              marketplace: account.marketplace.name,
              action: existingProduct ? 'updated' : 'created',
              success: true,
              marketplaceProductId: result.marketplaceProductId || existingProduct?.marketplaceProductId,
              data: result
            });
          } catch (error) {
            results.push({
              productId: product.id,
              accountId: account.id,
              marketplace: account.marketplace.name,
              action: 'failed',
              success: false,
              message: error.message,
              error: error
            });
          }
        }
      } catch (error) {
        // Account-level error
        for (const product of products) {
          results.push({
            productId: product.id,
            accountId: account.id,
            marketplace: account.marketplace?.name || 'Unknown',
            action: 'failed',
            success: false,
            message: `Account error: ${error.message}`,
            error: error
          });
        }
      }
    }

    return results;
  }

  /**
   * Find existing product in marketplace by SKU or other identifier
   * @param {BaseMarketplace} integration - Marketplace integration instance
   * @param {Object} product - Product to find
   * @param {Object} account - Marketplace account
   * @returns {Object|null} Existing product or null if not found
   */
  static async findExistingProduct(integration, product, account) {
    try {
      // Try to find by SKU first
      const products = await integration.getProducts({ search: product.sku, limit: 10 });
      
      for (const marketplaceProduct of products.data) {
        if (marketplaceProduct.sku === product.sku) {
          return marketplaceProduct;
        }
      }

      return null;
    } catch (error) {
      logger.warn(`Failed to search for existing product in ${account.marketplace.name}:`, error);
      return null;
    }
  }

  /**
   * Sync inventory across multiple marketplaces
   * @param {Array} inventoryUpdates - Array of inventory updates
   * @param {Array} marketplaceAccounts - Array of marketplace accounts
   * @returns {Array} Array of sync results
   */
  static async syncInventory(inventoryUpdates, marketplaceAccounts) {
    const results = [];

    for (const account of marketplaceAccounts) {
      try {
        const integration = this.createFromAccount(account);
        
        for (const update of inventoryUpdates) {
          try {
            const result = await integration.updateStock(
              update.marketplaceProductId,
              update.stock,
              update.variantId
            );

            results.push({
              productId: update.productId,
              variantId: update.variantId,
              accountId: account.id,
              marketplace: account.marketplace.name,
              success: true,
              newStock: update.stock,
              data: result
            });
          } catch (error) {
            results.push({
              productId: update.productId,
              variantId: update.variantId,
              accountId: account.id,
              marketplace: account.marketplace.name,
              success: false,
              message: error.message,
              error: error
            });
          }
        }
      } catch (error) {
        // Account-level error
        for (const update of inventoryUpdates) {
          results.push({
            productId: update.productId,
            variantId: update.variantId,
            accountId: account.id,
            marketplace: account.marketplace?.name || 'Unknown',
            success: false,
            message: `Account error: ${error.message}`,
            error: error
          });
        }
      }
    }

    return results;
  }
}

module.exports = MarketplaceFactory;
