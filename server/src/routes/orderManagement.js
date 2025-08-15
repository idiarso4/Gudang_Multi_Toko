const express = require('express');
const { body, validationResult } = require('express-validator');

const { prisma, paginate, dateRangeFilter } = require('../utils/database');
const { verifyToken, requireOwnershipOrAdmin } = require('../middleware/auth');
const orderManagementService = require('../services/orderManagementService');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication to all routes
router.use(verifyToken);

/**
 * @swagger
 * /api/order-management/orders:
 *   get:
 *     summary: Get orders with advanced filtering
 *     tags: [Order Management]
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
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: marketplace
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 */
router.get('/orders', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      marketplace, 
      search,
      startDate,
      endDate,
      sortBy = 'orderDate',
      sortOrder = 'desc'
    } = req.query;

    const pagination = paginate(parseInt(page), parseInt(limit));

    // Build where clause
    const where = {
      userId: req.user.id,
      ...(status && { status }),
      ...(marketplace && {
        marketplaceAccount: {
          marketplace: {
            code: marketplace
          }
        }
      }),
      ...(search && {
        OR: [
          { orderNumber: { contains: search, mode: 'insensitive' } },
          { marketplaceOrderId: { contains: search, mode: 'insensitive' } },
          { 
            customerInfo: {
              path: ['name'],
              string_contains: search
            }
          },
          { 
            customerInfo: {
              path: ['email'],
              string_contains: search
            }
          }
        ]
      }),
      ...dateRangeFilter(startDate, endDate, 'orderDate')
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          marketplaceAccount: {
            include: { marketplace: true }
          },
          orderItems: {
            include: {
              product: {
                select: { name: true, sku: true }
              },
              variant: {
                select: { variantName: true, sku: true }
              }
            }
          },
          statusHistory: {
            orderBy: { changedAt: 'desc' },
            take: 1
          },
          _count: {
            select: { orderItems: true }
          }
        },
        ...pagination,
        orderBy: { [sortBy]: sortOrder }
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
 * /api/order-management/orders/{id}:
 *   get:
 *     summary: Get order details
 *     tags: [Order Management]
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
 *         description: Order details retrieved successfully
 *       404:
 *         description: Order not found
 */
router.get('/orders/:id', requireOwnershipOrAdmin(async (req) => {
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
          include: { marketplace: true }
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
        statusHistory: {
          orderBy: { changedAt: 'desc' }
        },
        tags: true,
        assignedUser: {
          select: { id: true, fullName: true, email: true }
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
    logger.error('Get order details failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get order details'
    });
  }
});

/**
 * @swagger
 * /api/order-management/orders/{id}/status:
 *   patch:
 *     summary: Update order status
 *     tags: [Order Management]
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
 *               reason:
 *                 type: string
 *               updateMarketplace:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Order status updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Order not found
 */
router.patch('/orders/:id/status', requireOwnershipOrAdmin(async (req) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    select: { userId: true }
  });
  return order?.userId;
}), [
  body('status')
    .isIn(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'])
    .withMessage('Invalid status'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must not exceed 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { status, reason, updateMarketplace = false } = req.body;

    // Update order status
    const updatedOrder = await orderManagementService.updateOrderStatus(
      id,
      status,
      req.user.email,
      reason
    );

    // Update marketplace if requested
    if (updateMarketplace) {
      try {
        // This would be implemented based on marketplace APIs
        // await updateMarketplaceOrderStatus(updatedOrder, status);
      } catch (error) {
        logger.warn(`Failed to update marketplace status for order ${id}:`, error);
      }
    }

    logger.info(`Order status updated: ${id} to ${status} by user ${req.user.email}`);

    res.json({
      message: 'Order status updated successfully',
      order: updatedOrder
    });

  } catch (error) {
    if (error.message === 'Order not found') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Order not found'
      });
    }

    logger.error('Update order status failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update order status'
    });
  }
});

/**
 * @swagger
 * /api/order-management/orders/{id}/assign:
 *   patch:
 *     summary: Assign order to user
 *     tags: [Order Management]
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
 *             properties:
 *               assignedUserId:
 *                 type: string
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order assigned successfully
 */
router.patch('/orders/:id/assign', requireOwnershipOrAdmin(async (req) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    select: { userId: true }
  });
  return order?.userId;
}), async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedUserId, reason } = req.body;

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        assignedUserId,
        updatedAt: new Date()
      },
      include: {
        assignedUser: {
          select: { id: true, fullName: true, email: true }
        }
      }
    });

    // Create activity log
    await prisma.orderStatusHistory.create({
      data: {
        orderId: id,
        status: updatedOrder.status,
        changedBy: req.user.email,
        reason: reason || `Order assigned to ${updatedOrder.assignedUser?.fullName}`,
        changedAt: new Date()
      }
    });

    logger.info(`Order assigned: ${id} to ${assignedUserId} by user ${req.user.email}`);

    res.json({
      message: 'Order assigned successfully',
      order: updatedOrder
    });

  } catch (error) {
    logger.error('Assign order failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to assign order'
    });
  }
});

/**
 * @swagger
 * /api/order-management/orders/{id}/tags:
 *   post:
 *     summary: Add tag to order
 *     tags: [Order Management]
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
 *               - tag
 *             properties:
 *               tag:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tag added successfully
 */
router.post('/orders/:id/tags', requireOwnershipOrAdmin(async (req) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    select: { userId: true }
  });
  return order?.userId;
}), [
  body('tag')
    .trim()
    .notEmpty()
    .withMessage('Tag is required')
    .isLength({ max: 50 })
    .withMessage('Tag must not exceed 50 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { tag } = req.body;

    // Check if tag already exists
    const existingTag = await prisma.orderTag.findFirst({
      where: {
        orderId: id,
        tag: tag
      }
    });

    if (existingTag) {
      return res.status(400).json({
        error: 'Tag already exists',
        message: 'This tag is already added to the order'
      });
    }

    // Add tag
    const orderTag = await prisma.orderTag.create({
      data: {
        orderId: id,
        tag: tag,
        addedBy: req.user.email,
        addedAt: new Date()
      }
    });

    logger.info(`Tag added to order: ${id} - ${tag} by user ${req.user.email}`);

    res.json({
      message: 'Tag added successfully',
      tag: orderTag
    });

  } catch (error) {
    logger.error('Add order tag failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to add tag'
    });
  }
});

/**
 * @swagger
 * /api/order-management/sync:
 *   post:
 *     summary: Trigger order sync for marketplace
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - marketplaceAccountId
 *             properties:
 *               marketplaceAccountId:
 *                 type: string
 *               dateFrom:
 *                 type: string
 *                 format: date
 *               dateTo:
 *                 type: string
 *                 format: date
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order sync triggered successfully
 */
router.post('/sync', [
  body('marketplaceAccountId')
    .notEmpty()
    .withMessage('Marketplace account ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { marketplaceAccountId, dateFrom, dateTo, status } = req.body;

    // Verify marketplace account belongs to user
    const marketplaceAccount = await prisma.userMarketplaceAccount.findFirst({
      where: {
        id: marketplaceAccountId,
        userId: req.user.id,
        isConnected: true
      },
      include: {
        marketplace: true
      }
    });

    if (!marketplaceAccount) {
      return res.status(400).json({
        error: 'Invalid marketplace account',
        message: 'Marketplace account not found or not connected'
      });
    }

    // Trigger sync
    const result = await orderManagementService.syncMarketplaceOrders(
      marketplaceAccount,
      {
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
        status
      }
    );

    logger.info(`Order sync triggered for ${marketplaceAccount.marketplace.name} by user ${req.user.email}`);

    res.json({
      message: 'Order sync triggered successfully',
      result
    });

  } catch (error) {
    logger.error('Trigger order sync failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to trigger order sync'
    });
  }
});

/**
 * @swagger
 * /api/order-management/stats:
 *   get:
 *     summary: Get order statistics
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeRange
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
    const { timeRange = 'month' } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate;

    switch (timeRange) {
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
      orderDate: { gte: startDate }
    };

    const [
      totalOrders,
      ordersByStatus,
      ordersByMarketplace,
      totalRevenue,
      averageOrderValue
    ] = await Promise.all([
      prisma.order.count({ where }),
      
      prisma.order.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
        _sum: { totalAmount: true }
      }),
      
      prisma.order.groupBy({
        by: ['marketplaceAccountId'],
        where,
        _count: { id: true },
        _sum: { totalAmount: true }
      }),
      
      prisma.order.aggregate({
        where,
        _sum: { totalAmount: true }
      }),
      
      prisma.order.aggregate({
        where,
        _avg: { totalAmount: true }
      })
    ]);

    // Get marketplace names
    const marketplaceStats = await Promise.all(
      ordersByMarketplace.map(async (stat) => {
        const account = await prisma.userMarketplaceAccount.findUnique({
          where: { id: stat.marketplaceAccountId },
          include: { marketplace: true }
        });
        
        return {
          marketplaceName: account?.marketplace?.name || 'Unknown',
          orderCount: stat._count.id,
          totalRevenue: stat._sum.totalAmount || 0
        };
      })
    );

    const stats = {
      totalOrders,
      totalRevenue: totalRevenue._sum.totalAmount || 0,
      averageOrderValue: averageOrderValue._avg.totalAmount || 0,
      ordersByStatus: ordersByStatus.map(stat => ({
        status: stat.status,
        count: stat._count.id,
        revenue: stat._sum.totalAmount || 0
      })),
      ordersByMarketplace: marketplaceStats,
      timeRange
    };

    res.json({ stats });

  } catch (error) {
    logger.error('Get order stats failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get order statistics'
    });
  }
});

module.exports = router;
