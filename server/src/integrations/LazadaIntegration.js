const BaseMarketplace = require('./BaseMarketplace');
const crypto = require('crypto');

/**
 * Lazada marketplace integration
 * Documentation: https://open.lazada.com/doc/
 */
class LazadaIntegration extends BaseMarketplace {
  constructor(config) {
    super({
      ...config,
      baseURL: config.baseURL || 'https://api.lazada.com/rest'
    });
    
    this.appKey = config.appKey;
    this.appSecret = config.appSecret;
    this.accessToken = config.accessToken;
  }

  /**
   * Get authentication headers for Lazada API
   */
  getAuthHeaders(config) {
    const timestamp = Date.now().toString();
    const path = config.url.replace(this.baseURL, '');
    
    // Build parameters for signature
    const params = {
      app_key: this.appKey,
      timestamp,
      sign_method: 'sha256',
      access_token: this.accessToken,
      ...config.params
    };

    // Generate signature
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}${params[key]}`)
      .join('');
    
    const signature = crypto
      .createHmac('sha256', this.appSecret)
      .update(`${path}${sortedParams}`)
      .digest('hex')
      .toUpperCase();

    // Add signature to params
    params.sign = signature;

    // Update config params
    config.params = params;

    return {
      'Content-Type': 'application/json'
    };
  }

  /**
   * Get seller profile information
   */
  async getProfile() {
    const response = await this.client.get('/seller/get');
    return response.data;
  }

  /**
   * Get products from Lazada
   */
  async getProducts(params = {}) {
    const {
      page = 1,
      limit = 50,
      filter = 'all', // all, live, inactive, deleted, image-missing, pending, rejected, sold-out
      search,
      updateBefore,
      updateAfter
    } = params;

    const offset = (page - 1) * limit;
    
    const queryParams = {
      offset,
      limit,
      filter
    };

    if (search) {
      queryParams.search = search;
    }

    if (updateBefore) {
      queryParams.update_before = new Date(updateBefore).toISOString();
    }
    
    if (updateAfter) {
      queryParams.update_after = new Date(updateAfter).toISOString();
    }

    const response = await this.client.get('/products/get', {
      params: queryParams
    });

    const products = response.data.data?.products || [];
    
    return {
      data: products.map(product => this.normalizeProduct(product)),
      hasMore: products.length === limit,
      total: response.data.data?.total_products || 0
    };
  }

  /**
   * Get single product by ID
   */
  async getProduct(productId) {
    const response = await this.client.get('/product/item/get', {
      params: {
        item_id: productId
      }
    });

    if (!response.data.data) {
      throw new Error('Product not found');
    }

    return this.normalizeProduct(response.data.data);
  }

  /**
   * Create product in Lazada
   */
  async createProduct(product) {
    const lazadaProduct = this.formatProductForMarketplace(product);
    
    const response = await this.client.post('/product/create', {
      Request: lazadaProduct
    });
    
    if (response.data.code !== '0') {
      throw new Error(response.data.message || 'Failed to create product');
    }

    return {
      marketplaceProductId: response.data.data?.item_id?.toString(),
      data: response.data.data
    };
  }

  /**
   * Update product in Lazada
   */
  async updateProduct(productId, product) {
    const lazadaProduct = this.formatProductForMarketplace(product);
    lazadaProduct.item_id = parseInt(productId);

    const response = await this.client.post('/product/update', {
      Request: lazadaProduct
    });
    
    if (response.data.code !== '0') {
      throw new Error(response.data.message || 'Failed to update product');
    }

    return response.data.data;
  }

  /**
   * Delete product from Lazada
   */
  async deleteProduct(productId) {
    const response = await this.client.post('/product/remove', {
      Request: {
        item_id: parseInt(productId)
      }
    });
    
    if (response.data.code !== '0') {
      throw new Error(response.data.message || 'Failed to delete product');
    }

    return response.data.data;
  }

  /**
   * Update product stock in Lazada
   */
  async updateStock(productId, stock, variantId = null) {
    const stockData = {
      Request: {
        item_id: parseInt(productId),
        skus: []
      }
    };

    if (variantId) {
      stockData.Request.skus.push({
        sku_id: parseInt(variantId),
        quantity: stock
      });
    } else {
      // For products without variants, use the main SKU
      const productDetail = await this.getProduct(productId);
      if (productDetail.variants && productDetail.variants.length > 0) {
        stockData.Request.skus.push({
          sku_id: productDetail.variants[0].id,
          quantity: stock
        });
      }
    }

    const response = await this.client.post('/product/price_quantity/update', stockData);
    
    if (response.data.code !== '0') {
      throw new Error(response.data.message || 'Failed to update stock');
    }

    return response.data.data;
  }

  /**
   * Get orders from Lazada
   */
  async getOrders(params = {}) {
    const {
      page = 1,
      limit = 50,
      status = 'pending',
      dateFrom,
      dateTo,
      sortDirection = 'DESC',
      sortBy = 'created_at'
    } = params;

    const offset = (page - 1) * limit;
    
    const queryParams = {
      offset,
      limit,
      status,
      sort_direction: sortDirection,
      sort_by: sortBy
    };

    if (dateFrom) {
      queryParams.created_after = new Date(dateFrom).toISOString();
    }
    
    if (dateTo) {
      queryParams.created_before = new Date(dateTo).toISOString();
    }

    const response = await this.client.get('/orders/get', {
      params: queryParams
    });

    const orders = response.data.data?.orders || [];
    
    return {
      data: orders.map(order => this.normalizeOrder(order)),
      hasMore: orders.length === limit,
      total: response.data.data?.count || 0
    };
  }

  /**
   * Get single order by ID
   */
  async getOrder(orderId) {
    const response = await this.client.get('/order/get', {
      params: {
        order_id: orderId
      }
    });

    if (!response.data.data) {
      throw new Error('Order not found');
    }

    return this.normalizeOrder(response.data.data);
  }

  /**
   * Update order status in Lazada
   */
  async updateOrderStatus(orderId, status) {
    let endpoint;
    let payload = { order_item_id: orderId };

    switch (status) {
      case 'SHIPPED':
        endpoint = '/order/fulfill';
        payload.delivery_type = 'dropship'; // or 'send_to_warehouse'
        payload.tracking_number = 'AUTO_GENERATED';
        payload.shipping_provider = 'Standard Delivery';
        break;
      case 'CANCELLED':
        endpoint = '/order/cancel';
        payload.reason_detail = 'Out of stock';
        payload.reason_id = 15; // Out of stock reason ID
        break;
      default:
        throw new Error(`Unsupported status: ${status}`);
    }

    const response = await this.client.post(endpoint, {
      Request: payload
    });
    
    if (response.data.code !== '0') {
      throw new Error(response.data.message || 'Failed to update order status');
    }

    return response.data.data;
  }

  /**
   * Get categories from Lazada
   */
  async getCategories() {
    const response = await this.client.get('/category/tree/get');
    return response.data.data || [];
  }

  /**
   * Upload images to Lazada
   */
  async uploadImages(images) {
    const uploadedImages = [];

    for (const image of images) {
      const response = await this.client.post('/image/upload', {
        image: image.base64 || image.url
      });

      if (response.data.data?.image?.hash_code) {
        uploadedImages.push({
          url: response.data.data.image.url,
          hash: response.data.data.image.hash_code
        });
      }
    }

    return uploadedImages;
  }

  /**
   * Get shipping methods
   */
  async getShippingMethods() {
    const response = await this.client.get('/shipment/providers/get');
    return response.data.data || [];
  }

  /**
   * Get attributes for category
   */
  async getAttributes(categoryId) {
    const response = await this.client.get('/category/attributes/get', {
      params: {
        primary_category_id: categoryId
      }
    });
    return response.data.data || [];
  }

  /**
   * Normalize Lazada product to our format
   */
  normalizeProduct(lazadaProduct) {
    return {
      marketplaceProductId: lazadaProduct.item_id?.toString(),
      name: lazadaProduct.attributes?.name,
      description: lazadaProduct.attributes?.description,
      price: lazadaProduct.skus?.[0]?.price || 0,
      stock: lazadaProduct.skus?.[0]?.quantity || 0,
      sku: lazadaProduct.skus?.[0]?.SellerSku,
      status: lazadaProduct.status,
      images: lazadaProduct.images?.map(img => img.url) || [],
      variants: lazadaProduct.skus || [],
      categoryId: lazadaProduct.primary_category,
      weight: lazadaProduct.attributes?.package_weight,
      dimensions: {
        length: lazadaProduct.attributes?.package_length,
        width: lazadaProduct.attributes?.package_width,
        height: lazadaProduct.attributes?.package_height
      },
      attributes: lazadaProduct.attributes || {},
      createdAt: lazadaProduct.created_time,
      updatedAt: lazadaProduct.updated_time
    };
  }

  /**
   * Normalize Lazada order to our format
   */
  normalizeOrder(lazadaOrder) {
    return {
      marketplaceOrderId: lazadaOrder.order_number,
      status: lazadaOrder.statuses?.[0],
      totalAmount: parseFloat(lazadaOrder.price) || 0,
      shippingCost: parseFloat(lazadaOrder.shipping_fee) || 0,
      orderDate: lazadaOrder.created_at,
      customerInfo: {
        name: lazadaOrder.customer_first_name + ' ' + lazadaOrder.customer_last_name,
        phone: lazadaOrder.address_billing?.phone,
        email: null // Lazada doesn't provide email
      },
      shippingAddress: {
        name: lazadaOrder.address_shipping?.first_name + ' ' + lazadaOrder.address_shipping?.last_name,
        phone: lazadaOrder.address_shipping?.phone,
        address: lazadaOrder.address_shipping?.address1,
        city: lazadaOrder.address_shipping?.city,
        province: lazadaOrder.address_shipping?.region,
        postal_code: lazadaOrder.address_shipping?.post_code,
        country: lazadaOrder.address_shipping?.country
      },
      items: lazadaOrder.order_items?.map(item => ({
        productId: item.product_id?.toString(),
        variantId: item.sku_id?.toString(),
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        price: parseFloat(item.item_price),
        totalPrice: parseFloat(item.item_price) * item.quantity
      })) || []
    };
  }

  /**
   * Format our product to Lazada format
   */
  formatProductForMarketplace(product) {
    return {
      attributes: {
        name: product.name,
        description: product.description || '',
        brand: product.brand || 'No Brand',
        model: product.model || product.sku,
        package_weight: product.weight || 0.1,
        package_length: product.dimensions?.length || 10,
        package_width: product.dimensions?.width || 10,
        package_height: product.dimensions?.height || 10,
        package_content: product.description || product.name
      },
      category_id: product.categoryId,
      images: product.images?.map(url => ({ url })) || [],
      skus: [
        {
          SellerSku: product.sku,
          quantity: product.stock || 0,
          price: product.price,
          package_weight: product.weight || 0.1,
          package_length: product.dimensions?.length || 10,
          package_width: product.dimensions?.width || 10,
          package_height: product.dimensions?.height || 10
        }
      ]
    };
  }
}

module.exports = LazadaIntegration;
