const express = require('express');
const { body, validationResult } = require('express-validator');

const { prisma, paginate, searchFilter, dateRangeFilter } = require('../utils/database');
const { verifyToken, requireOwnershipOrAdmin } = require('../middleware/auth');
const { addOrderJob, addSyncJob } = require('../jobs/queueManager');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication to all routes
router.use(verifyToken);

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Get all orders for current user
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED, REFUNDED]
 *       - in: query
 *         name: marketplaceAccountId
 *         schema:
 *           type: string
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
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 */
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status, 
      marketplaceAccountId,
      startDate,
      endDate 
    } = req.query;
    
    const pagination = paginate(parseInt(page), parseInt(limit));
    
    // Build filters
    const where = {
      userId: req.user.id,
      ...searchFilter(search, ['orderNumber', 'marketplaceOrderId']),
      ...(status && { status }),
      ...(marketplaceAccountId && { marketplaceAccountId }),
      ...dateRangeFilter(startDate, endDate, 'orderDate')
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          marketplaceAccount: {
            include: {
              marketplace: {
                select: { name: true, code: true }
              }
            }
          },
          orderItems: {
            include: {
              product: {
                select: { id: true, name: true, sku: true, images: true }
              },
              variant: {
                select: { id: true, variantName: true, sku: true }
              }
            }
          },
          _count: {
            select: { orderItems: true }
          }
        },
        ...pagination,
        orderBy: { orderDate: 'desc' }
      }),
      prisma.order.count({ where })
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    logger.error('Get orders failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get orders'
    });
  }
});

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Get order by ID
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order retrieved successfully
 *       404:
 *         description: Order not found
 */
router.get('/:id', requireOwnershipOrAdmin(async (req) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    select: { userId: true }
  });
  return order?.userId;
}), async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        marketplaceAccount: {
          include: {
            marketplace: true
          }
        },
        orderItems: {
          include: {
            product: {
              select: { 
                id: true, 
                name: true, 
                sku: true, 
                images: true,
                price: true 
              }
            },
            variant: {
              select: { 
                id: true, 
                variantName: true, 
                sku: true,
                price: true 
              }
            }
          }
        },
        stockMovements: {
          include: {
            product: {
              select: { name: true, sku: true }
            },
            variant: {
              select: { variantName: true, sku: true }
            }
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Order not found'
      });
    }

    res.json({ order });

  } catch (error) {
    logger.error('Get order failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get order'
    });
  }
});

/**
 * @swagger
 * /api/orders/{id}/status:
 *   patch:
 *     summary: Update order status
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED, REFUNDED]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order status updated successfully
 *       400:
 *         description: Invalid status transition
 *       404:
 *         description: Order not found
 */
router.patch('/:id/status', [
  body('status')
    .isIn(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'])
    .withMessage('Invalid order status'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must not exceed 500 characters')
], requireOwnershipOrAdmin(async (req) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    select: { userId: true }
  });
  return order?.userId;
}), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { status, notes } = req.body;

    const order = await prisma.order.findUnique({
      where: { id }
    });

    if (!order) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Order not found'
      });
    }

    // Validate status transition
    const validTransitions = {
      'PENDING': ['CONFIRMED', 'CANCELLED'],
      'CONFIRMED': ['PROCESSING', 'CANCELLED'],
      'PROCESSING': ['SHIPPED', 'CANCELLED'],
      'SHIPPED': ['DELIVERED'],
      'DELIVERED': ['REFUNDED'],
      'CANCELLED': [],
      'REFUNDED': []
    };

    if (!validTransitions[order.status].includes(status)) {
      return res.status(400).json({
        error: 'Bad request',
        message: `Cannot change status from ${order.status} to ${status}`
      });
    }

    // Add status update job to queue
    const job = await addOrderJob('update-order-status', {
      orderId: id,
      status,
      notes,
      userId: req.user.id
    });

    logger.info(`Order status update job created: ${job.id} for order ${id}`);

    res.json({
      message: 'Order status update started',
      jobId: job.id
    });

  } catch (error) {
    logger.error('Update order status failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update order status'
    });
  }
});

/**
 * @swagger
 * /api/orders/sync:
 *   post:
 *     summary: Sync orders from marketplaces
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - marketplaceAccountIds
 *             properties:
 *               marketplaceAccountIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               dateRange:
 *                 type: object
 *                 properties:
 *                   startDate:
 *                     type: string
 *                     format: date
 *                   endDate:
 *                     type: string
 *                     format: date
 *     responses:
 *       200:
 *         description: Order sync started successfully
 *       400:
 *         description: Validation error
 */
router.post('/sync', [
  body('marketplaceAccountIds')
    .isArray({ min: 1 })
    .withMessage('At least one marketplace account ID is required'),
  body('dateRange.startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  body('dateRange.endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { marketplaceAccountIds, dateRange } = req.body;

    // Verify user owns the marketplace accounts
    const userAccounts = await prisma.userMarketplaceAccount.findMany({
      where: {
        id: { in: marketplaceAccountIds },
        userId: req.user.id
      }
    });

    if (userAccounts.length !== marketplaceAccountIds.length) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'One or more marketplace accounts do not belong to you'
      });
    }

    // Add sync job to queue for each marketplace account
    const jobs = [];
    for (const accountId of marketplaceAccountIds) {
      const job = await addSyncJob('sync-orders', {
        userId: req.user.id,
        marketplaceAccountId: accountId,
        dateRange: dateRange || {
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Last 30 days
          endDate: new Date().toISOString()
        }
      });
      jobs.push(job);
    }

    logger.info(`Order sync jobs created: ${jobs.map(j => j.id).join(', ')} for user ${req.user.id}`);

    res.json({
      message: 'Order sync started',
      jobIds: jobs.map(job => job.id)
    });

  } catch (error) {
    logger.error('Order sync failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to start order sync'
    });
  }
});

/**
 * @swagger
 * /api/orders/stats:
 *   get:
 *     summary: Get order statistics
 *     tags: [Orders]
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
 *         description: Order statistics retrieved successfully
 */
router.get('/stats', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    // Calculate date range based on period
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const where = {
      userId: req.user.id,
      orderDate: {
        gte: startDate,
        lte: now
      }
    };

    const [
      totalOrders,
      totalRevenue,
      ordersByStatus,
      ordersByMarketplace
    ] = await Promise.all([
      prisma.order.count({ where }),
      
      prisma.order.aggregate({
        where,
        _sum: { totalAmount: true }
      }),
      
      prisma.order.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        _sum: { totalAmount: true }
      }),
      
      prisma.order.groupBy({
        by: ['marketplaceAccountId'],
        where,
        _count: { _all: true },
        _sum: { totalAmount: true }
      })
    ]);

    // Get marketplace names for the grouped data
    const marketplaceAccountIds = ordersByMarketplace.map(item => item.marketplaceAccountId);
    const marketplaceAccounts = await prisma.userMarketplaceAccount.findMany({
      where: { id: { in: marketplaceAccountIds } },
      include: {
        marketplace: {
          select: { name: true, code: true }
        }
      }
    });

    const marketplaceMap = marketplaceAccounts.reduce((acc, account) => {
      acc[account.id] = account.marketplace;
      return acc;
    }, {});

    const ordersByMarketplaceWithNames = ordersByMarketplace.map(item => ({
      ...item,
      marketplace: marketplaceMap[item.marketplaceAccountId]
    }));

    res.json({
      period,
      dateRange: { startDate, endDate: now },
      stats: {
        totalOrders,
        totalRevenue: totalRevenue._sum.totalAmount || 0,
        ordersByStatus,
        ordersByMarketplace: ordersByMarketplaceWithNames
      }
    });

  } catch (error) {
    logger.error('Get order stats failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get order statistics'
    });
  }
});

module.exports = router;
