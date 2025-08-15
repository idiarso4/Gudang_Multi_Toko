const express = require('express');
const { prisma, dateRangeFilter } = require('../utils/database');
const { verifyToken } = require('../middleware/auth');
const { cache } = require('../utils/redis');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication to all routes
router.use(verifyToken);

/**
 * @swagger
 * /api/analytics/dashboard:
 *   get:
 *     summary: Get dashboard analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [today, week, month, year]
 *           default: month
 *     responses:
 *       200:
 *         description: Dashboard analytics retrieved successfully
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const cacheKey = `analytics:dashboard:${req.user.id}:${period}`;
    
    // Try to get from cache first
    let analytics = await cache.get(cacheKey);
    
    if (!analytics) {
      // Calculate date range based on period
      const now = new Date();
      let startDate, previousStartDate;
      
      switch (period) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          previousStartDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          previousStartDate = new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          previousStartDate = new Date(now.getFullYear() - 1, 0, 1);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      }

      const where = {
        userId: req.user.id,
        orderDate: { gte: startDate, lte: now }
      };

      const previousWhere = {
        userId: req.user.id,
        orderDate: { gte: previousStartDate, lt: startDate }
      };

      // Get current period data
      const [
        totalOrders,
        totalRevenue,
        totalProducts,
        totalMarketplaces,
        lowStockCount,
        ordersByStatus,
        revenueByMarketplace,
        topProducts
      ] = await Promise.all([
        // Total orders
        prisma.order.count({ where }),
        
        // Total revenue
        prisma.order.aggregate({
          where,
          _sum: { totalAmount: true }
        }),
        
        // Total products
        prisma.product.count({
          where: { userId: req.user.id, isActive: true }
        }),
        
        // Total connected marketplaces
        prisma.userMarketplaceAccount.count({
          where: { userId: req.user.id, isConnected: true }
        }),
        
        // Low stock items count
        prisma.inventory.count({
          where: {
            product: { userId: req.user.id, isActive: true },
            stockQuantity: { lte: prisma.raw('min_stock_level') },
            stockQuantity: { gt: 0 }
          }
        }),
        
        // Orders by status
        prisma.order.groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
          _sum: { totalAmount: true }
        }),
        
        // Revenue by marketplace
        prisma.order.groupBy({
          by: ['marketplaceAccountId'],
          where,
          _count: { _all: true },
          _sum: { totalAmount: true }
        }),
        
        // Top selling products
        prisma.orderItem.groupBy({
          by: ['productId'],
          where: {
            order: where
          },
          _sum: { quantity: true, totalPrice: true },
          _count: { _all: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 5
        })
      ]);

      // Get previous period data for comparison
      const [previousOrders, previousRevenue] = await Promise.all([
        prisma.order.count({ where: previousWhere }),
        prisma.order.aggregate({
          where: previousWhere,
          _sum: { totalAmount: true }
        })
      ]);

      // Calculate growth percentages
      const ordersGrowth = previousOrders > 0 
        ? ((totalOrders - previousOrders) / previousOrders) * 100 
        : 0;
      
      const revenueGrowth = previousRevenue._sum.totalAmount > 0 
        ? ((totalRevenue._sum.totalAmount - previousRevenue._sum.totalAmount) / previousRevenue._sum.totalAmount) * 100 
        : 0;

      // Get marketplace names for revenue data
      const marketplaceAccountIds = revenueByMarketplace.map(item => item.marketplaceAccountId);
      const marketplaceAccounts = await prisma.userMarketplaceAccount.findMany({
        where: { id: { in: marketplaceAccountIds } },
        include: {
          marketplace: { select: { name: true, code: true } }
        }
      });

      const marketplaceMap = marketplaceAccounts.reduce((acc, account) => {
        acc[account.id] = account.marketplace;
        return acc;
      }, {});

      const revenueByMarketplaceWithNames = revenueByMarketplace.map(item => ({
        ...item,
        marketplace: marketplaceMap[item.marketplaceAccountId]
      }));

      // Get product names for top products
      const productIds = topProducts.map(item => item.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, sku: true, images: true, price: true }
      });

      const productMap = products.reduce((acc, product) => {
        acc[product.id] = product;
        return acc;
      }, {});

      const topProductsWithDetails = topProducts.map(item => ({
        ...item,
        product: productMap[item.productId]
      }));

      analytics = {
        period,
        dateRange: { startDate, endDate: now },
        summary: {
          totalOrders: {
            current: totalOrders,
            previous: previousOrders,
            growth: ordersGrowth
          },
          totalRevenue: {
            current: totalRevenue._sum.totalAmount || 0,
            previous: previousRevenue._sum.totalAmount || 0,
            growth: revenueGrowth
          },
          totalProducts,
          totalMarketplaces,
          lowStockCount
        },
        ordersByStatus,
        revenueByMarketplace: revenueByMarketplaceWithNames,
        topProducts: topProductsWithDetails
      };

      // Cache for 5 minutes
      await cache.set(cacheKey, analytics, 300);
    }

    res.json({ analytics });

  } catch (error) {
    logger.error('Get dashboard analytics failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get dashboard analytics'
    });
  }
});

/**
 * @swagger
 * /api/analytics/sales:
 *   get:
 *     summary: Get sales analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: day
 *       - in: query
 *         name: marketplaceAccountId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sales analytics retrieved successfully
 */
router.get('/sales', async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day', marketplaceAccountId } = req.query;
    
    // Default to last 30 days if no date range provided
    const defaultEndDate = new Date();
    const defaultStartDate = new Date(defaultEndDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const dateRange = dateRangeFilter(
      startDate || defaultStartDate.toISOString(),
      endDate || defaultEndDate.toISOString(),
      'orderDate'
    );

    const where = {
      userId: req.user.id,
      ...dateRange,
      ...(marketplaceAccountId && { marketplaceAccountId })
    };

    // Get sales data grouped by time period
    const salesData = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC(${groupBy}, order_date) as period,
        COUNT(*)::int as order_count,
        SUM(total_amount)::float as total_revenue,
        AVG(total_amount)::float as avg_order_value
      FROM orders 
      WHERE user_id = ${req.user.id}
        AND order_date >= ${dateRange.orderDate.gte}
        AND order_date <= ${dateRange.orderDate.lte}
        ${marketplaceAccountId ? prisma.$queryRaw`AND marketplace_account_id = ${marketplaceAccountId}` : prisma.$queryRaw``}
      GROUP BY DATE_TRUNC(${groupBy}, order_date)
      ORDER BY period ASC
    `;

    // Get top selling products in the period
    const topProducts = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: where },
      _sum: { quantity: true, totalPrice: true },
      _count: { _all: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10
    });

    // Get product details for top products
    const productIds = topProducts.map(item => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true, images: true, price: true }
    });

    const productMap = products.reduce((acc, product) => {
      acc[product.id] = product;
      return acc;
    }, {});

    const topProductsWithDetails = topProducts.map(item => ({
      ...item,
      product: productMap[item.productId]
    }));

    // Calculate totals
    const totals = salesData.reduce((acc, item) => ({
      orderCount: acc.orderCount + item.order_count,
      totalRevenue: acc.totalRevenue + item.total_revenue,
      avgOrderValue: 0 // Will calculate after
    }), { orderCount: 0, totalRevenue: 0, avgOrderValue: 0 });

    totals.avgOrderValue = totals.orderCount > 0 ? totals.totalRevenue / totals.orderCount : 0;

    res.json({
      dateRange: {
        startDate: dateRange.orderDate.gte,
        endDate: dateRange.orderDate.lte
      },
      groupBy,
      totals,
      salesData,
      topProducts: topProductsWithDetails
    });

  } catch (error) {
    logger.error('Get sales analytics failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get sales analytics'
    });
  }
});

/**
 * @swagger
 * /api/analytics/inventory:
 *   get:
 *     summary: Get inventory analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Inventory analytics retrieved successfully
 */
router.get('/inventory', async (req, res) => {
  try {
    const cacheKey = `analytics:inventory:${req.user.id}`;
    
    // Try to get from cache first
    let analytics = await cache.get(cacheKey);
    
    if (!analytics) {
      const [
        totalProducts,
        totalVariants,
        totalStockValue,
        lowStockItems,
        outOfStockItems,
        stockByCategory,
        stockMovementsSummary
      ] = await Promise.all([
        // Total products
        prisma.product.count({
          where: { userId: req.user.id, isActive: true }
        }),
        
        // Total variants
        prisma.productVariant.count({
          where: { 
            product: { userId: req.user.id },
            isActive: true 
          }
        }),
        
        // Total stock value
        prisma.$queryRaw`
          SELECT SUM(i.stock_quantity * COALESCE(pv.cost, p.cost, 0))::float as total_value
          FROM inventory i
          JOIN products p ON i.product_id = p.id
          LEFT JOIN product_variants pv ON i.variant_id = pv.id
          WHERE p.user_id = ${req.user.id} AND p.is_active = true
        `,
        
        // Low stock items
        prisma.inventory.count({
          where: {
            product: { userId: req.user.id, isActive: true },
            stockQuantity: { lte: prisma.raw('min_stock_level') },
            stockQuantity: { gt: 0 }
          }
        }),
        
        // Out of stock items
        prisma.inventory.count({
          where: {
            product: { userId: req.user.id, isActive: true },
            stockQuantity: { lte: 0 }
          }
        }),
        
        // Stock by category
        prisma.$queryRaw`
          SELECT 
            c.name as category_name,
            COUNT(DISTINCT p.id)::int as product_count,
            SUM(i.stock_quantity)::int as total_stock,
            SUM(i.stock_quantity * COALESCE(pv.cost, p.cost, 0))::float as total_value
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          JOIN inventory i ON p.id = i.product_id
          LEFT JOIN product_variants pv ON i.variant_id = pv.id
          WHERE p.user_id = ${req.user.id} AND p.is_active = true
          GROUP BY c.id, c.name
          ORDER BY total_value DESC
        `,
        
        // Stock movements summary (last 30 days)
        prisma.stockMovement.groupBy({
          by: ['movementType'],
          where: {
            product: { userId: req.user.id },
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            }
          },
          _sum: { quantity: true },
          _count: { _all: true }
        })
      ]);

      analytics = {
        summary: {
          totalProducts,
          totalVariants,
          totalStockValue: totalStockValue[0]?.total_value || 0,
          lowStockItems,
          outOfStockItems
        },
        stockByCategory,
        stockMovementsSummary
      };

      // Cache for 10 minutes
      await cache.set(cacheKey, analytics, 600);
    }

    res.json({ analytics });

  } catch (error) {
    logger.error('Get inventory analytics failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get inventory analytics'
    });
  }
});

/**
 * @swagger
 * /api/analytics/marketplace-performance:
 *   get:
 *     summary: Get marketplace performance analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, quarter, year]
 *           default: month
 *     responses:
 *       200:
 *         description: Marketplace performance analytics retrieved successfully
 */
router.get('/marketplace-performance', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const where = {
      userId: req.user.id,
      orderDate: { gte: startDate, lte: now }
    };

    // Get performance by marketplace
    const performanceData = await prisma.order.groupBy({
      by: ['marketplaceAccountId'],
      where,
      _count: { _all: true },
      _sum: { totalAmount: true },
      _avg: { totalAmount: true }
    });

    // Get marketplace details
    const marketplaceAccountIds = performanceData.map(item => item.marketplaceAccountId);
    const marketplaceAccounts = await prisma.userMarketplaceAccount.findMany({
      where: { id: { in: marketplaceAccountIds } },
      include: {
        marketplace: { select: { name: true, code: true } },
        _count: {
          select: {
            marketplaceProducts: true,
            syncLogs: true
          }
        }
      }
    });

    const marketplaceMap = marketplaceAccounts.reduce((acc, account) => {
      acc[account.id] = account;
      return acc;
    }, {});

    const performanceWithDetails = performanceData.map(item => ({
      ...item,
      marketplaceAccount: marketplaceMap[item.marketplaceAccountId],
      conversionRate: 0, // TODO: Calculate based on views/visits data
      avgOrderValue: item._avg.totalAmount || 0,
      totalRevenue: item._sum.totalAmount || 0,
      totalOrders: item._count._all
    }));

    // Sort by revenue
    performanceWithDetails.sort((a, b) => b.totalRevenue - a.totalRevenue);

    res.json({
      period,
      dateRange: { startDate, endDate: now },
      marketplacePerformance: performanceWithDetails
    });

  } catch (error) {
    logger.error('Get marketplace performance analytics failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get marketplace performance analytics'
    });
  }
});

module.exports = router;
