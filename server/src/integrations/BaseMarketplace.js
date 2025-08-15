const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Base class for marketplace integrations
 * All marketplace integrations should extend this class
 */
class BaseMarketplace {
  constructor(config) {
    this.config = config;
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.credentials = config.credentials;
    this.baseURL = config.baseURL;
    this.timeout = config.timeout || 30000;
    
    // Create axios instance
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MarketplaceIntegration/1.0'
      }
    });

    // Setup request/response interceptors
    this.setupInterceptors();
  }

  /**
   * Setup axios interceptors for request/response handling
   */
  setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add authentication headers
        config.headers = {
          ...config.headers,
          ...this.getAuthHeaders(config)
        };

        logger.debug(`${this.constructor.name} API Request:`, {
          method: config.method,
          url: config.url,
          params: config.params
        });

        return config;
      },
      (error) => {
        logger.error(`${this.constructor.name} Request Error:`, error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`${this.constructor.name} API Response:`, {
          status: response.status,
          url: response.config.url
        });
        return response;
      },
      (error) => {
        logger.error(`${this.constructor.name} Response Error:`, {
          status: error.response?.status,
          message: error.response?.data?.message || error.message,
          url: error.config?.url
        });
        return Promise.reject(this.handleError(error));
      }
    );
  }

  /**
   * Get authentication headers for API requests
   * Should be implemented by each marketplace
   */
  getAuthHeaders(config) {
    throw new Error('getAuthHeaders method must be implemented by marketplace class');
  }

  /**
   * Handle API errors and normalize them
   */
  handleError(error) {
    const normalizedError = {
      marketplace: this.constructor.name,
      status: error.response?.status,
      message: error.response?.data?.message || error.message,
      code: error.response?.data?.code || error.code,
      originalError: error.response?.data || error.message
    };

    return normalizedError;
  }

  /**
   * Test connection to marketplace API
   */
  async testConnection() {
    try {
      const result = await this.getProfile();
      return {
        success: true,
        message: 'Connection successful',
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Connection failed',
        error
      };
    }
  }

  /**
   * Generate signature for API authentication
   * Common method used by many marketplaces
   */
  generateSignature(params, secret, algorithm = 'sha256') {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    return crypto
      .createHmac(algorithm, secret)
      .update(sortedParams)
      .digest('hex');
  }

  /**
   * Generate timestamp in required format
   */
  getTimestamp() {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * Normalize product data from marketplace format to our format
   */
  normalizeProduct(marketplaceProduct) {
    throw new Error('normalizeProduct method must be implemented by marketplace class');
  }

  /**
   * Normalize order data from marketplace format to our format
   */
  normalizeOrder(marketplaceOrder) {
    throw new Error('normalizeOrder method must be implemented by marketplace class');
  }

  /**
   * Convert our product format to marketplace format
   */
  formatProductForMarketplace(product) {
    throw new Error('formatProductForMarketplace method must be implemented by marketplace class');
  }

  // ==================== ABSTRACT METHODS ====================
  // These methods must be implemented by each marketplace integration

  /**
   * Get marketplace profile/shop information
   */
  async getProfile() {
    throw new Error('getProfile method must be implemented by marketplace class');
  }

  /**
   * Get products from marketplace
   */
  async getProducts(params = {}) {
    throw new Error('getProducts method must be implemented by marketplace class');
  }

  /**
   * Get single product by ID
   */
  async getProduct(productId) {
    throw new Error('getProduct method must be implemented by marketplace class');
  }

  /**
   * Create/upload product to marketplace
   */
  async createProduct(product) {
    throw new Error('createProduct method must be implemented by marketplace class');
  }

  /**
   * Update product in marketplace
   */
  async updateProduct(productId, product) {
    throw new Error('updateProduct method must be implemented by marketplace class');
  }

  /**
   * Delete product from marketplace
   */
  async deleteProduct(productId) {
    throw new Error('deleteProduct method must be implemented by marketplace class');
  }

  /**
   * Update product stock in marketplace
   */
  async updateStock(productId, stock, variantId = null) {
    throw new Error('updateStock method must be implemented by marketplace class');
  }

  /**
   * Get orders from marketplace
   */
  async getOrders(params = {}) {
    throw new Error('getOrders method must be implemented by marketplace class');
  }

  /**
   * Get single order by ID
   */
  async getOrder(orderId) {
    throw new Error('getOrder method must be implemented by marketplace class');
  }

  /**
   * Update order status in marketplace
   */
  async updateOrderStatus(orderId, status) {
    throw new Error('updateOrderStatus method must be implemented by marketplace class');
  }

  /**
   * Get categories from marketplace
   */
  async getCategories() {
    throw new Error('getCategories method must be implemented by marketplace class');
  }

  /**
   * Upload product images to marketplace
   */
  async uploadImages(images) {
    throw new Error('uploadImages method must be implemented by marketplace class');
  }

  /**
   * Get shipping methods available in marketplace
   */
  async getShippingMethods() {
    throw new Error('getShippingMethods method must be implemented by marketplace class');
  }

  /**
   * Get marketplace-specific attributes/specifications
   */
  async getAttributes(categoryId = null) {
    throw new Error('getAttributes method must be implemented by marketplace class');
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Paginate through all results
   */
  async *paginateAll(method, params = {}) {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await method.call(this, { ...params, page });
      
      if (result.data && result.data.length > 0) {
        yield* result.data;
        page++;
        hasMore = result.hasMore || result.data.length === (params.limit || 50);
      } else {
        hasMore = false;
      }
    }
  }

  /**
   * Retry failed requests with exponential backoff
   */
  async retryRequest(requestFn, maxRetries = 3, baseDelay = 1000) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          break;
        }

        // Don't retry on client errors (4xx)
        if (error.status >= 400 && error.status < 500) {
          break;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);
        logger.warn(`${this.constructor.name} request failed, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Rate limit requests to avoid hitting API limits
   */
  async rateLimit(requestsPerSecond = 5) {
    const delay = 1000 / requestsPerSecond;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

module.exports = BaseMarketplace;
