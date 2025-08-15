const BaseMarketplace = require('./BaseMarketplace');

/**
 * Tokopedia marketplace integration
 * Documentation: https://developer.tokopedia.com/
 */
class TokopediaIntegration extends BaseMarketplace {
  constructor(config) {
    super({
      ...config,
      baseURL: config.baseURL || 'https://fs.tokopedia.net'
    });
    
    this.fsId = config.fsId;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.accessToken = config.accessToken;
  }

  /**
   * Get authentication headers for Tokopedia API
   */
  getAuthHeaders(config) {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      'X-Tkpd-Client-Id': this.clientId
    };
  }

  /**
   * Get shop profile information
   */
  async getProfile() {
    const response = await this.client.get(`/v1/shop/${this.fsId}/info`);
    return response.data;
  }

  /**
   * Get products from Tokopedia
   */
  async getProducts(params = {}) {
    const {
      page = 1,
      limit = 50,
      sort = 'create_time',
      order = 'desc'
    } = params;

    const queryParams = {
      page,
      per_page: limit,
      sort,
      order
    };

    const response = await this.client.get(`/inventory/v1/fs/${this.fsId}/product`, {
      params: queryParams
    });

    const products = response.data.data || [];
    
    return {
      data: products.map(product => this.normalizeProduct(product)),
      hasMore: products.length === limit,
      total: response.data.meta?.total_data || 0
    };
  }

  /**
   * Get single product by ID
   */
  async getProduct(productId) {
    const response = await this.client.get(`/inventory/v1/fs/${this.fsId}/product/${productId}`);
    
    if (!response.data.data) {
      throw new Error('Product not found');
    }

    return this.normalizeProduct(response.data.data);
  }

  /**
   * Create product in Tokopedia
   */
  async createProduct(product) {
    const tokopediaProduct = this.formatProductForMarketplace(product);
    
    const response = await this.client.post(`/inventory/v1/fs/${this.fsId}/product`, tokopediaProduct);
    
    if (response.data.header?.error_code !== '0') {
      throw new Error(response.data.header?.reason || 'Failed to create product');
    }

    return {
      marketplaceProductId: response.data.data?.product_id?.toString(),
      data: response.data.data
    };
  }

  /**
   * Update product in Tokopedia
   */
  async updateProduct(productId, product) {
    const tokopediaProduct = this.formatProductForMarketplace(product);

    const response = await this.client.patch(`/inventory/v1/fs/${this.fsId}/product/${productId}`, tokopediaProduct);
    
    if (response.data.header?.error_code !== '0') {
      throw new Error(response.data.header?.reason || 'Failed to update product');
    }

    return response.data.data;
  }

  /**
   * Delete product from Tokopedia
   */
  async deleteProduct(productId) {
    const response = await this.client.delete(`/inventory/v1/fs/${this.fsId}/product/${productId}`);
    
    if (response.data.header?.error_code !== '0') {
      throw new Error(response.data.header?.reason || 'Failed to delete product');
    }

    return response.data.data;
  }

  /**
   * Update product stock in Tokopedia
   */
  async updateStock(productId, stock, variantId = null) {
    const stockData = {
      products: [
        {
          product_id: parseInt(productId),
          stock: stock
        }
      ]
    };

    if (variantId) {
      stockData.products[0].variant_id = parseInt(variantId);
    }

    const response = await this.client.post(`/inventory/v1/fs/${this.fsId}/stock`, stockData);
    
    if (response.data.header?.error_code !== '0') {
      throw new Error(response.data.header?.reason || 'Failed to update stock');
    }

    return response.data.data;
  }

  /**
   * Get orders from Tokopedia
   */
  async getOrders(params = {}) {
    const {
      page = 1,
      limit = 50,
      status = 'new',
      dateFrom,
      dateTo
    } = params;

    const queryParams = {
      page,
      per_page: limit,
      status
    };

    if (dateFrom) {
      queryParams.from_date = new Date(dateFrom).toISOString().split('T')[0];
    }
    
    if (dateTo) {
      queryParams.to_date = new Date(dateTo).toISOString().split('T')[0];
    }

    const response = await this.client.get(`/v2/order/list`, {
      params: queryParams
    });

    const orders = response.data.data || [];
    
    return {
      data: orders.map(order => this.normalizeOrder(order)),
      hasMore: orders.length === limit,
      total: response.data.meta?.total_data || 0
    };
  }

  /**
   * Get single order by ID
   */
  async getOrder(orderId) {
    const response = await this.client.get(`/v2/fs/${this.fsId}/order`, {
      params: {
        invoice_num: orderId
      }
    });

    const orders = response.data.data || [];
    if (orders.length === 0) {
      throw new Error('Order not found');
    }

    return this.normalizeOrder(orders[0]);
  }

  /**
   * Update order status in Tokopedia
   */
  async updateOrderStatus(orderId, status) {
    let endpoint;
    let payload = { order_id: parseInt(orderId) };

    switch (status) {
      case 'CONFIRMED':
        endpoint = `/v1/fs/${this.fsId}/order/ack`;
        break;
      case 'SHIPPED':
        endpoint = `/v1/fs/${this.fsId}/order/shipping`;
        payload.shipping_ref_num = 'AUTO_GENERATED'; // You might want to pass actual tracking number
        break;
      case 'CANCELLED':
        endpoint = `/v1/fs/${this.fsId}/order/reject`;
        payload.reason_code = 1; // Out of stock
        payload.reason = 'Out of stock';
        break;
      default:
        throw new Error(`Unsupported status: ${status}`);
    }

    const response = await this.client.post(endpoint, payload);
    
    if (response.data.header?.error_code !== '0') {
      throw new Error(response.data.header?.reason || 'Failed to update order status');
    }

    return response.data.data;
  }

  /**
   * Get categories from Tokopedia
   */
  async getCategories() {
    const response = await this.client.get('/inventory/v1/fs/product/category');
    return response.data.data || [];
  }

  /**
   * Upload images to Tokopedia
   */
  async uploadImages(images) {
    const uploadedImages = [];

    for (const image of images) {
      const formData = new FormData();
      formData.append('file', image.buffer, image.filename);

      const response = await this.client.post('/v1/fs/upload/image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.data?.picture?.url_original) {
        uploadedImages.push({
          url: response.data.data.picture.url_original,
          id: response.data.data.picture.pic_id
        });
      }
    }

    return uploadedImages;
  }

  /**
   * Get shipping methods
   */
  async getShippingMethods() {
    const response = await this.client.get('/v2/logistic/fs/shipping');
    return response.data.data || [];
  }

  /**
   * Get attributes for category
   */
  async getAttributes(categoryId) {
    const response = await this.client.get(`/inventory/v1/fs/product/category/attributes`, {
      params: {
        category_id: categoryId
      }
    });
    return response.data.data || [];
  }

  /**
   * Normalize Tokopedia product to our format
   */
  normalizeProduct(tokopediaProduct) {
    return {
      marketplaceProductId: tokopediaProduct.basic?.productID?.toString(),
      name: tokopediaProduct.basic?.name,
      description: tokopediaProduct.basic?.description,
      price: tokopediaProduct.price?.value || 0,
      stock: tokopediaProduct.stock?.value || 0,
      sku: tokopediaProduct.basic?.sku,
      status: tokopediaProduct.basic?.status,
      images: tokopediaProduct.pictures?.map(pic => pic.url_original) || [],
      variants: tokopediaProduct.variant || [],
      categoryId: tokopediaProduct.basic?.category?.id,
      weight: tokopediaProduct.weight?.value || 0,
      dimensions: {
        length: tokopediaProduct.dimension?.length || 0,
        width: tokopediaProduct.dimension?.width || 0,
        height: tokopediaProduct.dimension?.height || 0
      },
      attributes: tokopediaProduct.attributes || [],
      createdAt: tokopediaProduct.basic?.createTime,
      updatedAt: tokopediaProduct.basic?.updateTime
    };
  }

  /**
   * Normalize Tokopedia order to our format
   */
  normalizeOrder(tokopediaOrder) {
    return {
      marketplaceOrderId: tokopediaOrder.invoice_number,
      status: tokopediaOrder.order_status,
      totalAmount: tokopediaOrder.amt?.total || 0,
      shippingCost: tokopediaOrder.amt?.shipping_cost || 0,
      orderDate: tokopediaOrder.create_time,
      customerInfo: {
        name: tokopediaOrder.buyer?.name,
        phone: tokopediaOrder.buyer?.phone,
        email: tokopediaOrder.buyer?.email
      },
      shippingAddress: {
        name: tokopediaOrder.recipient?.name,
        phone: tokopediaOrder.recipient?.phone,
        address: tokopediaOrder.recipient?.address,
        city: tokopediaOrder.recipient?.city,
        province: tokopediaOrder.recipient?.province,
        postal_code: tokopediaOrder.recipient?.postal_code
      },
      items: tokopediaOrder.products?.map(item => ({
        productId: item.id?.toString(),
        variantId: item.variant_id?.toString(),
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.total_price
      })) || []
    };
  }

  /**
   * Format our product to Tokopedia format
   */
  formatProductForMarketplace(product) {
    return {
      basic: {
        name: product.name,
        description: product.description || '',
        sku: product.sku,
        category_id: product.categoryId,
        condition: 'NEW',
        min_order: 1
      },
      price: {
        value: product.price,
        currency: 'IDR'
      },
      weight: {
        value: product.weight || 0,
        unit: 'GR'
      },
      stock: {
        value: product.stock || 0
      },
      pictures: product.images?.map(url => ({ url_original: url })) || [],
      variant: product.variants || [],
      attributes: product.attributes || []
    };
  }
}

module.exports = TokopediaIntegration;
