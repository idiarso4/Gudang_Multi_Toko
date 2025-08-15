const { prisma } = require('../utils/database');
const logger = require('../utils/logger');

/**
 * Reporting and Analytics Service
 * Handles comprehensive reporting and analytics across all business metrics
 */
class ReportingService {
  constructor() {
    this.reportCache = new Map(); // Cache for expensive reports
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  }

  /**
   * Get comprehensive dashboard analytics
   */
  async getDashboardAnalytics(userId, timeRange = 'month') {
    try {
      const cacheKey = `dashboard-${userId}-${timeRange}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const dateRange = this.getDateRange(timeRange);
      const previousDateRange = this.getPreviousDateRange(timeRange);

      const [
        salesMetrics,
        orderMetrics,
        productMetrics,
        inventoryMetrics,
        marketplaceMetrics,
        revenueByDay,
        topProducts,
        recentOrders,
        lowStockItems
      ] = await Promise.all([
        this.getSalesMetrics(userId, dateRange, previousDateRange),
        this.getOrderMetrics(userId, dateRange, previousDateRange),
        this.getProductMetrics(userId, dateRange),
        this.getInventoryMetrics(userId),
        this.getMarketplaceMetrics(userId, dateRange),
        this.getRevenueByDay(userId, dateRange),
        this.getTopProducts(userId, dateRange, 10),
        this.getRecentOrders(userId, 10),
        this.getLowStockItems(userId, 10)
      ]);

      const analytics = {
        summary: {
          totalRevenue: salesMetrics,
          totalOrders: orderMetrics,
          totalProducts: productMetrics.totalProducts,
          lowStockCount: inventoryMetrics.lowStockCount
        },
        charts: {
          revenueByDay,
          revenueByMarketplace: marketplaceMetrics
        },
        topProducts,
        recentOrders,
        lowStockItems,
        marketplaceBreakdown: marketplaceMetrics,
        timeRange
      };

      this.setCache(cacheKey, analytics);
      return analytics;

    } catch (error) {
      logger.error('Failed to get dashboard analytics:', error);
      throw error;
    }
  }

  /**
   * Get sales metrics with growth comparison
   */
  async getSalesMetrics(userId, dateRange, previousDateRange) {
    const [current, previous] = await Promise.all([
      prisma.order.aggregate({
        where: {
          userId,
          orderDate: { gte: dateRange.start, lte: dateRange.end },
          status: { in: ['DELIVERED', 'SHIPPED'] }
        },
        _sum: { totalAmount: true },
        _count: { id: true }
      }),
      prisma.order.aggregate({
        where: {
          userId,
          orderDate: { gte: previousDateRange.start, lte: previousDateRange.end },
          status: { in: ['DELIVERED', 'SHIPPED'] }
        },
        _sum: { totalAmount: true },
        _count: { id: true }
      })
    ]);

    const currentRevenue = current._sum.totalAmount || 0;
    const previousRevenue = previous._sum.totalAmount || 0;
    const growth = previousRevenue > 0 
      ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 
      : 0;

    return {
      current: currentRevenue,
      previous: previousRevenue,
      growth: Math.round(growth * 100) / 100
    };
  }

  /**
   * Get order metrics with growth comparison
   */
  async getOrderMetrics(userId, dateRange, previousDateRange) {
    const [current, previous] = await Promise.all([
      prisma.order.count({
        where: {
          userId,
          orderDate: { gte: dateRange.start, lte: dateRange.end }
        }
      }),
      prisma.order.count({
        where: {
          userId,
          orderDate: { gte: previousDateRange.start, lte: previousDateRange.end }
        }
      })
    ]);

    const growth = previous > 0 ? ((current - previous) / previous) * 100 : 0;

    return {
      current,
      previous,
      growth: Math.round(growth * 100) / 100
    };
  }

  /**
   * Get product metrics
   */
  async getProductMetrics(userId, dateRange) {
    const [totalProducts, activeProducts, soldProducts] = await Promise.all([
      prisma.product.count({
        where: { userId, isActive: true }
      }),
      prisma.product.count({
        where: { userId, isActive: true }
      }),
      prisma.orderItem.groupBy({
        by: ['productId'],
        where: {
          order: {
            userId,
            orderDate: { gte: dateRange.start, lte: dateRange.end }
          }
        },
        _count: { productId: true }
      })
    ]);

    return {
      totalProducts,
      activeProducts,
      soldProductsCount: soldProducts.length
    };
  }

  /**
   * Get inventory metrics
   */
  async getInventoryMetrics(userId) {
    const [totalStock, lowStockCount, outOfStockCount] = await Promise.all([
      prisma.inventory.aggregate({
        where: {
          product: { userId }
        },
        _sum: { stockQuantity: true }
      }),
      prisma.inventory.count({
        where: {
          product: { userId },
          stockQuantity: { lte: prisma.inventory.fields.minStockLevel }
        }
      }),
      prisma.inventory.count({
        where: {
          product: { userId },
          stockQuantity: 0
        }
      })
    ]);

    return {
      totalStock: totalStock._sum.stockQuantity || 0,
      lowStockCount,
      outOfStockCount
    };
  }

  /**
   * Get marketplace performance metrics
   */
  async getMarketplaceMetrics(userId, dateRange) {
    const marketplaceData = await prisma.order.groupBy({
      by: ['marketplaceAccountId'],
      where: {
        userId,
        orderDate: { gte: dateRange.start, lte: dateRange.end },
        status: { in: ['DELIVERED', 'SHIPPED'] }
      },
      _sum: { totalAmount: true },
      _count: { id: true }
    });

    // Get marketplace names
    const enrichedData = await Promise.all(
      marketplaceData.map(async (data) => {
        const account = await prisma.userMarketplaceAccount.findUnique({
          where: { id: data.marketplaceAccountId },
          include: { marketplace: true }
        });

        return {
          marketplaceAccountId: data.marketplaceAccountId,
          marketplace: account?.marketplace,
          _sum: data._sum,
          _count: data._count
        };
      })
    );

    return enrichedData;
  }

  /**
   * Get revenue by day for charts
   */
  async getRevenueByDay(userId, dateRange) {
    const dailyRevenue = await prisma.$queryRaw`
      SELECT 
        DATE(order_date) as date,
        SUM(total_amount) as revenue,
        COUNT(*) as orders
      FROM orders 
      WHERE user_id = ${userId}
        AND order_date >= ${dateRange.start}
        AND order_date <= ${dateRange.end}
        AND status IN ('DELIVERED', 'SHIPPED')
      GROUP BY DATE(order_date)
      ORDER BY date ASC
    `;

    return dailyRevenue.map(day => ({
      date: day.date,
      revenue: parseFloat(day.revenue) || 0,
      orders: parseInt(day.orders) || 0
    }));
  }

  /**
   * Get top performing products
   */
  async getTopProducts(userId, dateRange, limit = 10) {
    const topProducts = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          userId,
          orderDate: { gte: dateRange.start, lte: dateRange.end },
          status: { in: ['DELIVERED', 'SHIPPED'] }
        }
      },
      _sum: {
        quantity: true,
        totalPrice: true
      },
      _count: { id: true },
      orderBy: {
        _sum: { totalPrice: 'desc' }
      },
      take: limit
    });

    // Enrich with product data
    const enrichedProducts = await Promise.all(
      topProducts.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: { id: true, name: true, sku: true, images: true }
        });

        return {
          productId: item.productId,
          product,
          _sum: item._sum,
          _count: item._count
        };
      })
    );

    return enrichedProducts;
  }

  /**
   * Get recent orders
   */
  async getRecentOrders(userId, limit = 10) {
    return await prisma.order.findMany({
      where: { userId },
      include: {
        marketplaceAccount: {
          include: { marketplace: true }
        },
        _count: { select: { orderItems: true } }
      },
      orderBy: { orderDate: 'desc' },
      take: limit
    });
  }

  /**
   * Get low stock items
   */
  async getLowStockItems(userId, limit = 10) {
    return await prisma.inventory.findMany({
      where: {
        product: { userId },
        stockQuantity: { lte: prisma.inventory.fields.minStockLevel }
      },
      include: {
        product: {
          select: { id: true, name: true, sku: true, images: true }
        },
        variant: {
          select: { id: true, variantName: true, sku: true }
        }
      },
      orderBy: { stockQuantity: 'asc' },
      take: limit
    });
  }

  /**
   * Generate sales report
   */
  async generateSalesReport(userId, options = {}) {
    try {
      const {
        startDate,
        endDate,
        groupBy = 'day', // day, week, month
        marketplaceId,
        productId,
        format = 'json' // json, csv, pdf
      } = options;

      const dateRange = {
        start: startDate ? new Date(startDate) : this.getDateRange('month').start,
        end: endDate ? new Date(endDate) : this.getDateRange('month').end
      };

      let whereClause = {
        userId,
        orderDate: { gte: dateRange.start, lte: dateRange.end },
        status: { in: ['DELIVERED', 'SHIPPED'] }
      };

      if (marketplaceId) {
        whereClause.marketplaceAccountId = marketplaceId;
      }

      // Get sales data
      const salesData = await this.getSalesDataGrouped(whereClause, groupBy);
      
      // Get order status breakdown
      const statusBreakdown = await this.getOrderStatusBreakdown(whereClause);
      
      // Get product performance
      const productPerformance = await this.getProductPerformance(whereClause, productId);
      
      // Get marketplace comparison
      const marketplaceComparison = await this.getMarketplaceComparison(whereClause);

      const report = {
        metadata: {
          generatedAt: new Date(),
          dateRange,
          groupBy,
          filters: { marketplaceId, productId }
        },
        summary: {
          totalRevenue: salesData.reduce((sum, item) => sum + item.revenue, 0),
          totalOrders: salesData.reduce((sum, item) => sum + item.orders, 0),
          averageOrderValue: 0, // Will be calculated
          period: groupBy
        },
        salesData,
        statusBreakdown,
        productPerformance,
        marketplaceComparison
      };

      // Calculate average order value
      report.summary.averageOrderValue = report.summary.totalOrders > 0 
        ? report.summary.totalRevenue / report.summary.totalOrders 
        : 0;

      if (format === 'csv') {
        return this.convertToCSV(report);
      } else if (format === 'pdf') {
        return this.convertToPDF(report);
      }

      return report;

    } catch (error) {
      logger.error('Failed to generate sales report:', error);
      throw error;
    }
  }

  /**
   * Get sales data grouped by time period
   */
  async getSalesDataGrouped(whereClause, groupBy) {
    let dateFormat;
    switch (groupBy) {
      case 'week':
        dateFormat = 'YYYY-"W"WW';
        break;
      case 'month':
        dateFormat = 'YYYY-MM';
        break;
      default:
        dateFormat = 'YYYY-MM-DD';
    }

    const salesData = await prisma.$queryRaw`
      SELECT 
        TO_CHAR(order_date, ${dateFormat}) as period,
        SUM(total_amount) as revenue,
        COUNT(*) as orders,
        AVG(total_amount) as avg_order_value
      FROM orders 
      WHERE user_id = ${whereClause.userId}
        AND order_date >= ${whereClause.orderDate.gte}
        AND order_date <= ${whereClause.orderDate.lte}
        AND status = ANY(${whereClause.status.in})
        ${whereClause.marketplaceAccountId ? `AND marketplace_account_id = ${whereClause.marketplaceAccountId}` : ''}
      GROUP BY TO_CHAR(order_date, ${dateFormat})
      ORDER BY period ASC
    `;

    return salesData.map(item => ({
      period: item.period,
      revenue: parseFloat(item.revenue) || 0,
      orders: parseInt(item.orders) || 0,
      avgOrderValue: parseFloat(item.avg_order_value) || 0
    }));
  }

  /**
   * Get order status breakdown
   */
  async getOrderStatusBreakdown(whereClause) {
    const statusData = await prisma.order.groupBy({
      by: ['status'],
      where: whereClause,
      _count: { id: true },
      _sum: { totalAmount: true }
    });

    return statusData.map(item => ({
      status: item.status,
      count: item._count.id,
      revenue: item._sum.totalAmount || 0
    }));
  }

  /**
   * Get product performance data
   */
  async getProductPerformance(whereClause, productId = null) {
    let productWhere = {
      order: whereClause
    };

    if (productId) {
      productWhere.productId = productId;
    }

    const productData = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: productWhere,
      _sum: {
        quantity: true,
        totalPrice: true
      },
      _count: { id: true },
      orderBy: {
        _sum: { totalPrice: 'desc' }
      },
      take: 20
    });

    // Enrich with product names
    const enrichedData = await Promise.all(
      productData.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: { name: true, sku: true }
        });

        return {
          productId: item.productId,
          productName: product?.name || 'Unknown',
          sku: product?.sku || 'Unknown',
          quantitySold: item._sum.quantity || 0,
          revenue: item._sum.totalPrice || 0,
          orderCount: item._count.id
        };
      })
    );

    return enrichedData;
  }

  /**
   * Get marketplace comparison data
   */
  async getMarketplaceComparison(whereClause) {
    const marketplaceData = await prisma.order.groupBy({
      by: ['marketplaceAccountId'],
      where: whereClause,
      _sum: { totalAmount: true },
      _count: { id: true },
      _avg: { totalAmount: true }
    });

    // Enrich with marketplace names
    const enrichedData = await Promise.all(
      marketplaceData.map(async (item) => {
        const account = await prisma.userMarketplaceAccount.findUnique({
          where: { id: item.marketplaceAccountId },
          include: { marketplace: true }
        });

        return {
          marketplaceId: item.marketplaceAccountId,
          marketplaceName: account?.marketplace?.name || 'Unknown',
          revenue: item._sum.totalAmount || 0,
          orders: item._count.id,
          avgOrderValue: item._avg.totalAmount || 0
        };
      })
    );

    return enrichedData;
  }

  /**
   * Get date range based on period
   */
  getDateRange(period) {
    const now = new Date();
    let start, end;

    switch (period) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        break;
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        end = now;
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = now;
        break;
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), quarter * 3, 1);
        end = now;
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        end = now;
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = now;
    }

    return { start, end };
  }

  /**
   * Get previous period date range for comparison
   */
  getPreviousDateRange(period) {
    const current = this.getDateRange(period);
    const duration = current.end.getTime() - current.start.getTime();
    
    return {
      start: new Date(current.start.getTime() - duration),
      end: new Date(current.end.getTime() - duration)
    };
  }

  /**
   * Cache management
   */
  getFromCache(key) {
    const cached = this.reportCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  setCache(key, data) {
    this.reportCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Convert report to CSV format
   */
  convertToCSV(report) {
    // Implementation for CSV conversion
    // This would convert the report data to CSV format
    return 'CSV conversion not implemented yet';
  }

  /**
   * Convert report to PDF format
   */
  convertToPDF(report) {
    // Implementation for PDF conversion
    // This would use a library like puppeteer or jsPDF
    return 'PDF conversion not implemented yet';
  }
}

// Create singleton instance
const reportingService = new ReportingService();

module.exports = reportingService;
