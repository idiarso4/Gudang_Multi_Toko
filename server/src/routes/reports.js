const express = require('express');
const { query, validationResult } = require('express-validator');

const { verifyToken } = require('../middleware/auth');
const reportingService = require('../services/reportingService');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication to all routes
router.use(verifyToken);

/**
 * @swagger
 * /api/reports/dashboard:
 *   get:
 *     summary: Get dashboard analytics
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: string
 *           enum: [today, week, month, quarter, year]
 *           default: month
 *     responses:
 *       200:
 *         description: Dashboard analytics retrieved successfully
 */
router.get('/dashboard', [
  query('timeRange')
    .optional()
    .isIn(['today', 'week', 'month', 'quarter', 'year'])
    .withMessage('Invalid time range')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { timeRange = 'month' } = req.query;

    const analytics = await reportingService.getDashboardAnalytics(
      req.user.id,
      timeRange
    );

    res.json({
      analytics,
      generatedAt: new Date()
    });

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
 * /api/reports/sales:
 *   get:
 *     summary: Generate sales report
 *     tags: [Reports]
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
 *         name: marketplaceId
 *         schema:
 *           type: string
 *       - in: query
 *         name: productId
 *         schema:
 *           type: string
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv, pdf]
 *           default: json
 *     responses:
 *       200:
 *         description: Sales report generated successfully
 */
router.get('/sales', [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format'),
  query('groupBy')
    .optional()
    .isIn(['day', 'week', 'month'])
    .withMessage('Invalid groupBy value'),
  query('format')
    .optional()
    .isIn(['json', 'csv', 'pdf'])
    .withMessage('Invalid format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      startDate,
      endDate,
      groupBy = 'day',
      marketplaceId,
      productId,
      format = 'json'
    } = req.query;

    const report = await reportingService.generateSalesReport(req.user.id, {
      startDate,
      endDate,
      groupBy,
      marketplaceId,
      productId,
      format
    });

    // Set appropriate headers for different formats
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.csv');
    } else if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
    }

    res.json({ report });

  } catch (error) {
    logger.error('Generate sales report failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to generate sales report'
    });
  }
});

/**
 * @swagger
 * /api/reports/products:
 *   get:
 *     summary: Get product performance report
 *     tags: [Reports]
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
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [revenue, quantity, orders]
 *           default: revenue
 *     responses:
 *       200:
 *         description: Product performance report retrieved successfully
 */
router.get('/products', [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('sortBy')
    .optional()
    .isIn(['revenue', 'quantity', 'orders'])
    .withMessage('Invalid sortBy value')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      startDate,
      endDate,
      limit = 20,
      sortBy = 'revenue'
    } = req.query;

    const dateRange = startDate && endDate 
      ? { start: new Date(startDate), end: new Date(endDate) }
      : reportingService.getDateRange('month');

    const whereClause = {
      userId: req.user.id,
      orderDate: { gte: dateRange.start, lte: dateRange.end },
      status: { in: ['DELIVERED', 'SHIPPED'] }
    };

    const productPerformance = await reportingService.getProductPerformance(
      whereClause,
      null,
      parseInt(limit),
      sortBy
    );

    res.json({
      products: productPerformance,
      metadata: {
        dateRange,
        limit: parseInt(limit),
        sortBy,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Get product performance failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get product performance'
    });
  }
});

/**
 * @swagger
 * /api/reports/marketplaces:
 *   get:
 *     summary: Get marketplace performance comparison
 *     tags: [Reports]
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
 *         name: timeRange
 *         schema:
 *           type: string
 *           enum: [today, week, month, quarter, year]
 *           default: month
 *     responses:
 *       200:
 *         description: Marketplace performance retrieved successfully
 */
router.get('/marketplaces', [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format'),
  query('timeRange')
    .optional()
    .isIn(['today', 'week', 'month', 'quarter', 'year'])
    .withMessage('Invalid time range')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { startDate, endDate, timeRange = 'month' } = req.query;

    const dateRange = startDate && endDate 
      ? { start: new Date(startDate), end: new Date(endDate) }
      : reportingService.getDateRange(timeRange);

    const whereClause = {
      userId: req.user.id,
      orderDate: { gte: dateRange.start, lte: dateRange.end },
      status: { in: ['DELIVERED', 'SHIPPED'] }
    };

    const marketplaceComparison = await reportingService.getMarketplaceComparison(whereClause);

    res.json({
      marketplaces: marketplaceComparison,
      metadata: {
        dateRange,
        timeRange,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Get marketplace performance failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get marketplace performance'
    });
  }
});

/**
 * @swagger
 * /api/reports/inventory:
 *   get:
 *     summary: Get inventory report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeMovements
 *         schema:
 *           type: boolean
 *           default: false
 *       - in: query
 *         name: lowStockOnly
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: Inventory report retrieved successfully
 */
router.get('/inventory', [
  query('includeMovements')
    .optional()
    .isBoolean()
    .withMessage('includeMovements must be boolean'),
  query('lowStockOnly')
    .optional()
    .isBoolean()
    .withMessage('lowStockOnly must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { includeMovements = false, lowStockOnly = false } = req.query;

    // Get inventory metrics
    const inventoryMetrics = await reportingService.getInventoryMetrics(req.user.id);

    // Get inventory items
    let whereClause = {
      product: { userId: req.user.id }
    };

    if (lowStockOnly === 'true') {
      whereClause.stockQuantity = { lte: prisma.inventory.fields.minStockLevel };
    }

    const inventoryItems = await prisma.inventory.findMany({
      where: whereClause,
      include: {
        product: {
          select: { id: true, name: true, sku: true, images: true }
        },
        variant: {
          select: { id: true, variantName: true, sku: true }
        }
      },
      orderBy: { stockQuantity: 'asc' }
    });

    let stockMovements = [];
    if (includeMovements === 'true') {
      stockMovements = await prisma.stockMovement.findMany({
        where: { userId: req.user.id },
        include: {
          product: {
            select: { name: true, sku: true }
          },
          variant: {
            select: { variantName: true, sku: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 100
      });
    }

    res.json({
      metrics: inventoryMetrics,
      items: inventoryItems,
      movements: stockMovements,
      metadata: {
        includeMovements: includeMovements === 'true',
        lowStockOnly: lowStockOnly === 'true',
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Get inventory report failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get inventory report'
    });
  }
});

/**
 * @swagger
 * /api/reports/financial:
 *   get:
 *     summary: Get financial summary report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: string
 *           enum: [today, week, month, quarter, year]
 *           default: month
 *     responses:
 *       200:
 *         description: Financial report retrieved successfully
 */
router.get('/financial', [
  query('timeRange')
    .optional()
    .isIn(['today', 'week', 'month', 'quarter', 'year'])
    .withMessage('Invalid time range')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { timeRange = 'month' } = req.query;
    const dateRange = reportingService.getDateRange(timeRange);

    // Get financial metrics
    const [revenue, orders, refunds, shipping] = await Promise.all([
      // Total revenue
      prisma.order.aggregate({
        where: {
          userId: req.user.id,
          orderDate: { gte: dateRange.start, lte: dateRange.end },
          status: { in: ['DELIVERED', 'SHIPPED'] }
        },
        _sum: { totalAmount: true },
        _count: { id: true }
      }),
      
      // Order breakdown by status
      prisma.order.groupBy({
        by: ['status'],
        where: {
          userId: req.user.id,
          orderDate: { gte: dateRange.start, lte: dateRange.end }
        },
        _count: { id: true },
        _sum: { totalAmount: true }
      }),
      
      // Refunds
      prisma.order.aggregate({
        where: {
          userId: req.user.id,
          orderDate: { gte: dateRange.start, lte: dateRange.end },
          status: 'REFUNDED'
        },
        _sum: { totalAmount: true },
        _count: { id: true }
      }),
      
      // Shipping costs
      prisma.order.aggregate({
        where: {
          userId: req.user.id,
          orderDate: { gte: dateRange.start, lte: dateRange.end },
          status: { in: ['DELIVERED', 'SHIPPED'] }
        },
        _sum: { shippingCost: true }
      })
    ]);

    const financialSummary = {
      revenue: {
        total: revenue._sum.totalAmount || 0,
        orders: revenue._count.id || 0,
        average: revenue._count.id > 0 ? (revenue._sum.totalAmount || 0) / revenue._count.id : 0
      },
      refunds: {
        total: refunds._sum.totalAmount || 0,
        count: refunds._count.id || 0
      },
      shipping: {
        total: shipping._sum.shippingCost || 0
      },
      netRevenue: (revenue._sum.totalAmount || 0) - (refunds._sum.totalAmount || 0),
      orderBreakdown: orders.map(order => ({
        status: order.status,
        count: order._count.id,
        amount: order._sum.totalAmount || 0
      }))
    };

    res.json({
      financial: financialSummary,
      metadata: {
        timeRange,
        dateRange,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Get financial report failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get financial report'
    });
  }
});

module.exports = router;
