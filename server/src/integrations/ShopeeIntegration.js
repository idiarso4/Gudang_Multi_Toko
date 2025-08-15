const BaseMarketplace = require('./BaseMarketplace');
const crypto = require('crypto');

/**
 * Shopee marketplace integration
 * Documentation: https://open.shopee.com/documents
 */
class ShopeeIntegration extends BaseMarketplace {
  constructor(config) {
    super({
      ...config,
      baseURL: config.baseURL || 'https://partner.shopeemobile.com'
    });
    
    this.partnerId = config.partnerId;
    this.shopId = config.shopId;
    this.accessToken = config.accessToken;
  }

  /**
   * Get authentication headers for Shopee API
   */
  getAuthHeaders(config) {
    const timestamp = this.getTimestamp();
    const path = config.url.replace(this.baseURL, '');
    
    // Generate signature
    const baseString = `${this.partnerId}${path}${timestamp}${this.accessToken}${this.shopId}`;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(baseString)
      .digest('hex');

    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      'X-Shopee-Partner-Id': this.partnerId,
      'X-Shopee-Shop-Id': this.shopId,
      'X-Shopee-Timestamp': timestamp,
      'X-Shopee-Signature': signature
    };
  }

  /**
   * Get shop profile information
   */
  async getProfile() {
    const response = await this.client.get('/api/v2/shop/get_shop_info');
    return response.data;
  }

  /**
   * Get products from Shopee
   */
  async getProducts(params = {}) {
    const {
      page = 1,
      limit = 50,
      status = 'NORMAL', // NORMAL, DELETED, BANNED
      updateTimeFrom,
      updateTimeTo
    } = params;

    const offset = (page - 1) * limit;
    
    const queryParams = {
      offset,
      page_size: limit,
      item_status: status
    };

    if (updateTimeFrom) {
      queryParams.update_time_from = Math.floor(new Date(updateTimeFrom).getTime() / 1000);
    }
    
    if (updateTimeTo) {
      queryParams.update_time_to = Math.floor(new Date(updateTimeTo).getTime() / 1000);
    }

    const response = await this.client.get('/api/v2/product/get_item_list', {
      params: queryParams
    });

    const items = response.data.response?.item || [];
    
    // Get detailed product information
    if (items.length > 0) {
      const itemIds = items.map(item => item.item_id);
      const detailResponse = await this.client.get('/api/v2/product/get_item_base_info', {
        params: {
          item_id_list: itemIds.join(',')
        }
      });

      const detailedItems = detailResponse.data.response?.item_list || [];
      return {
        data: detailedItems.map(item => this.normalizeProduct(item)),
        hasMore: items.length === limit,
        total: response.data.response?.total_count || 0
      };
    }

    return {
      data: [],
      hasMore: false,
      total: 0
    };
  }

  /**
   * Get single product by ID
   */
  async getProduct(productId) {
    const response = await this.client.get('/api/v2/product/get_item_base_info', {
      params: {
        item_id_list: productId
      }
    });

    const items = response.data.response?.item_list || [];
    if (items.length === 0) {
      throw new Error('Product not found');
    }

    return this.normalizeProduct(items[0]);
  }

  /**
   * Create product in Shopee
   */
  async createProduct(product) {
    const shopeeProduct = this.formatProductForMarketplace(product);
    
    const response = await this.client.post('/api/v2/product/add_item', shopeeProduct);
    
    if (response.data.error) {
      throw new Error(response.data.message || 'Failed to create product');
    }

    return {
      marketplaceProductId: response.data.response?.item_id?.toString(),
      data: response.data.response
    };
  }

  /**
   * Update product in Shopee
   */
  async updateProduct(productId, product) {
    const shopeeProduct = this.formatProductForMarketplace(product);
    shopeeProduct.item_id = parseInt(productId);

    const response = await this.client.post('/api/v2/product/update_item', shopeeProduct);
    
    if (response.data.error) {
      throw new Error(response.data.message || 'Failed to update product');
    }

    return response.data.response;
  }

  /**
   * Delete product from Shopee
   */
  async deleteProduct(productId) {
    const response = await this.client.post('/api/v2/product/delete_item', {
      item_id: parseInt(productId)
    });
    
    if (response.data.error) {
      throw new Error(response.data.message || 'Failed to delete product');
    }

    return response.data.response;
  }

  /**
   * Update product stock in Shopee
   */
  async updateStock(productId, stock, variantId = null) {
    const stockData = {
      item_id: parseInt(productId),
      stock_list: []
    };

    if (variantId) {
      stockData.stock_list.push({
        model_id: parseInt(variantId),
        normal_stock: stock
      });
    } else {
      stockData.stock_list.push({
        model_id: 0, // 0 for main product without variants
        normal_stock: stock
      });
    }

    const response = await this.client.post('/api/v2/product/update_stock', stockData);
    
    if (response.data.error) {
      throw new Error(response.data.message || 'Failed to update stock');
    }

    return response.data.response;
  }

  /**
   * Get orders from Shopee
   */
  async getOrders(params = {}) {
    const {
      page = 1,
      limit = 50,
      status = 'READY_TO_SHIP',
      dateFrom,
      dateTo
    } = params;

    const offset = (page - 1) * limit;
    
    const queryParams = {
      offset,
      page_size: limit,
      order_status: status
    };

    if (dateFrom) {
      queryParams.time_from = Math.floor(new Date(dateFrom).getTime() / 1000);
    }
    
    if (dateTo) {
      queryParams.time_to = Math.floor(new Date(dateTo).getTime() / 1000);
    }

    const response = await this.client.get('/api/v2/order/get_order_list', {
      params: queryParams
    });

    const orders = response.data.response?.order_list || [];
    
    // Get detailed order information
    if (orders.length > 0) {
      const orderSns = orders.map(order => order.order_sn);
      const detailResponse = await this.client.get('/api/v2/order/get_order_detail', {
        params: {
          order_sn_list: orderSns.join(',')
        }
      });

      const detailedOrders = detailResponse.data.response?.order_list || [];
      return {
        data: detailedOrders.map(order => this.normalizeOrder(order)),
        hasMore: orders.length === limit,
        total: response.data.response?.total_count || 0
      };
    }

    return {
      data: [],
      hasMore: false,
      total: 0
    };
  }

  /**
   * Get single order by ID
   */
  async getOrder(orderId) {
    const response = await this.client.get('/api/v2/order/get_order_detail', {
      params: {
        order_sn_list: orderId
      }
    });

    const orders = response.data.response?.order_list || [];
    if (orders.length === 0) {
      throw new Error('Order not found');
    }

    return this.normalizeOrder(orders[0]);
  }

  /**
   * Update order status in Shopee
   */
  async updateOrderStatus(orderId, status) {
    // Shopee uses different endpoints for different status updates
    let endpoint;
    let payload = { order_sn: orderId };

    switch (status) {
      case 'SHIPPED':
        endpoint = '/api/v2/logistics/ship_order';
        break;
      case 'CANCELLED':
        endpoint = '/api/v2/order/cancel_order';
        payload.cancel_reason = 'OUT_OF_STOCK'; // Default reason
        break;
      default:
        throw new Error(`Unsupported status: ${status}`);
    }

    const response = await this.client.post(endpoint, payload);
    
    if (response.data.error) {
      throw new Error(response.data.message || 'Failed to update order status');
    }

    return response.data.response;
  }

  /**
   * Get categories from Shopee
   */
  async getCategories() {
    const response = await this.client.get('/api/v2/product/get_category');
    return response.data.response?.category_list || [];
  }

  /**
   * Upload images to Shopee
   */
  async uploadImages(images) {
    const uploadedImages = [];

    for (const image of images) {
      const response = await this.client.post('/api/v2/media_space/upload_image', {
        image: image.base64 || image.url
      });

      if (response.data.response?.image_info) {
        uploadedImages.push({
          url: response.data.response.image_info.image_url,
          id: response.data.response.image_info.image_id
        });
      }
    }

    return uploadedImages;
  }

  /**
   * Get shipping methods
   */
  async getShippingMethods() {
    const response = await this.client.get('/api/v2/logistics/get_shipping_parameter');
    return response.data.response?.logistics || [];
  }

  /**
   * Get attributes for category
   */
  async getAttributes(categoryId) {
    const response = await this.client.get('/api/v2/product/get_attributes', {
      params: {
        category_id: categoryId
      }
    });
    return response.data.response?.attribute_list || [];
  }

  /**
   * Normalize Shopee product to our format
   */
  normalizeProduct(shopeeProduct) {
    return {
      marketplaceProductId: shopeeProduct.item_id?.toString(),
      name: shopeeProduct.item_name,
      description: shopeeProduct.description,
      price: shopeeProduct.price_info?.current_price || 0,
      stock: shopeeProduct.stock_info?.current_stock || 0,
      sku: shopeeProduct.item_sku,
      status: shopeeProduct.item_status,
      images: shopeeProduct.image?.image_url_list || [],
      variants: shopeeProduct.tier_variation || [],
      categoryId: shopeeProduct.category_id,
      weight: shopeeProduct.weight,
      dimensions: shopeeProduct.dimension,
      attributes: shopeeProduct.attribute_list || [],
      createdAt: new Date(shopeeProduct.create_time * 1000).toISOString(),
      updatedAt: new Date(shopeeProduct.update_time * 1000).toISOString()
    };
  }

  /**
   * Normalize Shopee order to our format
   */
  normalizeOrder(shopeeOrder) {
    return {
      marketplaceOrderId: shopeeOrder.order_sn,
      status: shopeeOrder.order_status,
      totalAmount: shopeeOrder.total_amount || 0,
      shippingCost: shopeeOrder.estimated_shipping_fee || 0,
      orderDate: new Date(shopeeOrder.create_time * 1000).toISOString(),
      customerInfo: {
        name: shopeeOrder.recipient_address?.name,
        phone: shopeeOrder.recipient_address?.phone,
        email: null // Shopee doesn't provide email
      },
      shippingAddress: shopeeOrder.recipient_address,
      items: shopeeOrder.item_list?.map(item => ({
        productId: item.item_id?.toString(),
        variantId: item.model_id?.toString(),
        sku: item.item_sku,
        name: item.item_name,
        quantity: item.model_quantity_purchased,
        price: item.model_discounted_price || item.model_original_price,
        totalPrice: (item.model_discounted_price || item.model_original_price) * item.model_quantity_purchased
      })) || []
    };
  }

  /**
   * Format our product to Shopee format
   */
  formatProductForMarketplace(product) {
    return {
      item_name: product.name,
      description: product.description || '',
      item_sku: product.sku,
      category_id: product.categoryId,
      price: product.price,
      stock: product.stock || 0,
      weight: product.weight || 0,
      dimension: product.dimensions || {},
      image: {
        image_url_list: product.images || []
      },
      attribute_list: product.attributes || [],
      tier_variation: product.variants || []
    };
  }
}

module.exports = ShopeeIntegration;
