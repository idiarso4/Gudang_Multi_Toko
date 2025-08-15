const express = require('express');
const { body, validationResult } = require('express-validator');

const { prisma, paginate, dateRangeFilter } = require('../utils/database');
const { verifyToken } = require('../middleware/auth');
const { addSyncJob, getQueueStats } = require('../jobs/queueManager');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication to all routes
router.use(verifyToken);

/**
 * @swagger
 * /api/sync/products:
 *   post:
 *     summary: Start product sync job
 *     tags: [Sync]
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
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               syncAll:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Product sync job started successfully
 *       400:
 *         description: Validation error
 */
router.post('/products', [
  body('marketplaceAccountIds')
    .isArray({ min: 1 })
    .withMessage('At least one marketplace account ID is required'),
  body('productIds')
    .optional()
    .isArray()
    .withMessage('Product IDs must be an array'),
  body('syncAll')
    .optional()
    .isBoolean()
    .withMessage('syncAll must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { marketplaceAccountIds, productIds, syncAll = false } = req.body;

    // Verify user owns the marketplace accounts
    const userAccounts = await prisma.userMarketplaceAccount.findMany({
      where: {
        id: { in: marketplaceAccountIds },
        userId: req.user.id,
        isConnected: true
      }
    });

    if (userAccounts.length !== marketplaceAccountIds.length) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'One or more marketplace accounts do not belong to you or are not connected'
      });
    }

    // Get product IDs to sync
    let productsToSync = productIds;
    
    if (syncAll || !productIds || productIds.length === 0) {
      const userProducts = await prisma.product.findMany({
        where: { userId: req.user.id, isActive: true },
        select: { id: true }
      });
      productsToSync = userProducts.map(p => p.id);
    } else {
      // Verify user owns the products
      const userProducts = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          userId: req.user.id
        },
        select: { id: true }
      });

      if (userProducts.length !== productIds.length) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'One or more products do not belong to you'
        });
      }
    }

    if (productsToSync.length === 0) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'No products to sync'
      });
    }

    // Create sync jobs
    const jobs = [];
    for (const accountId of marketplaceAccountIds) {
      const job = await addSyncJob('sync-products', {
        userId: req.user.id,
        marketplaceAccountId: accountId,
        productIds: productsToSync
      });
      jobs.push(job);
    }

    logger.info(`Product sync jobs created: ${jobs.map(j => j.id).join(', ')} for user ${req.user.id}`);

    res.json({
      message: 'Product sync jobs started successfully',
      jobIds: jobs.map(job => job.id),
      productCount: productsToSync.length,
      marketplaceCount: marketplaceAccountIds.length
    });

  } catch (error) {
    logger.error('Start product sync failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to start product sync'
    });
  }
});

/**
 * @swagger
 * /api/sync/orders:
 *   post:
 *     summary: Start order sync job
 *     tags: [Sync]
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
 *         description: Order sync job started successfully
 *       400:
 *         description: Validation error
 */
router.post('/orders', [
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
        userId: req.user.id,
        isConnected: true
      }
    });

    if (userAccounts.length !== marketplaceAccountIds.length) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'One or more marketplace accounts do not belong to you or are not connected'
      });
    }

    // Default date range to last 30 days if not provided
    const defaultDateRange = {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date().toISOString()
    };

    const syncDateRange = dateRange || defaultDateRange;

    // Create sync jobs
    const jobs = [];
    for (const accountId of marketplaceAccountIds) {
      const job = await addSyncJob('sync-orders', {
        userId: req.user.id,
        marketplaceAccountId: accountId,
        dateRange: syncDateRange
      });
      jobs.push(job);
    }

    logger.info(`Order sync jobs created: ${jobs.map(j => j.id).join(', ')} for user ${req.user.id}`);

    res.json({
      message: 'Order sync jobs started successfully',
      jobIds: jobs.map(job => job.id),
      dateRange: syncDateRange,
      marketplaceCount: marketplaceAccountIds.length
    });

  } catch (error) {
    logger.error('Start order sync failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to start order sync'
    });
  }
});

/**
 * @swagger
 * /api/sync/inventory:
 *   post:
 *     summary: Start inventory sync job
 *     tags: [Sync]
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
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               syncAll:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Inventory sync job started successfully
 *       400:
 *         description: Validation error
 */
router.post('/inventory', [
  body('marketplaceAccountIds')
    .isArray({ min: 1 })
    .withMessage('At least one marketplace account ID is required'),
  body('productIds')
    .optional()
    .isArray()
    .withMessage('Product IDs must be an array'),
  body('syncAll')
    .optional()
    .isBoolean()
    .withMessage('syncAll must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { marketplaceAccountIds, productIds, syncAll = false } = req.body;

    // Verify user owns the marketplace accounts
    const userAccounts = await prisma.userMarketplaceAccount.findMany({
      where: {
        id: { in: marketplaceAccountIds },
        userId: req.user.id,
        isConnected: true
      }
    });

    if (userAccounts.length !== marketplaceAccountIds.length) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'One or more marketplace accounts do not belong to you or are not connected'
      });
    }

    // Get product IDs to sync
    let productsToSync = productIds;
    
    if (syncAll || !productIds || productIds.length === 0) {
      const userProducts = await prisma.product.findMany({
        where: { userId: req.user.id, isActive: true },
        select: { id: true }
      });
      productsToSync = userProducts.map(p => p.id);
    } else {
      // Verify user owns the products
      const userProducts = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          userId: req.user.id
        },
        select: { id: true }
      });

      if (userProducts.length !== productIds.length) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'One or more products do not belong to you'
        });
      }
    }

    if (productsToSync.length === 0) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'No products to sync'
      });
    }

    // Create sync jobs
    const jobs = [];
    for (const accountId of marketplaceAccountIds) {
      const job = await addSyncJob('sync-inventory', {
        userId: req.user.id,
        marketplaceAccountId: accountId,
        productIds: productsToSync
      });
      jobs.push(job);
    }

    logger.info(`Inventory sync jobs created: ${jobs.map(j => j.id).join(', ')} for user ${req.user.id}`);

    res.json({
      message: 'Inventory sync jobs started successfully',
      jobIds: jobs.map(job => job.id),
      productCount: productsToSync.length,
      marketplaceCount: marketplaceAccountIds.length
    });

  } catch (error) {
    logger.error('Start inventory sync failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to start inventory sync'
    });
  }
});

/**
 * @swagger
 * /api/sync/status/{jobId}:
 *   get:
 *     summary: Get sync job status
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job status retrieved successfully
 *       404:
 *         description: Job not found
 */
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    // TODO: Implement job status checking with Bull queue
    // For now, return a mock response
    const jobStatus = {
      id: jobId,
      status: 'completed', // pending, active, completed, failed
      progress: 100,
      data: {
        userId: req.user.id,
        type: 'sync-products'
      },
      result: {
        processed: 10,
        successful: 8,
        failed: 2,
        errors: []
      },
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };

    res.json({ job: jobStatus });

  } catch (error) {
    logger.error('Get sync job status failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get sync job status'
    });
  }
});

/**
 * @swagger
 * /api/sync/logs:
 *   get:
 *     summary: Get sync logs
 *     tags: [Sync]
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
 *         name: syncType
 *         schema:
 *           type: string
 *           enum: [PRODUCTS, ORDERS, INVENTORY, FULL_SYNC]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, IN_PROGRESS, SUCCESS, FAILED, PARTIAL]
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
 *         description: Sync logs retrieved successfully
 */
router.get('/logs', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      syncType, 
      status, 
      marketplaceAccountId,
      startDate,
      endDate 
    } = req.query;
    
    const pagination = paginate(parseInt(page), parseInt(limit));
    
    // Build filters
    const where = {
      marketplaceAccount: {
        userId: req.user.id
      },
      ...(syncType && { syncType }),
      ...(status && { status }),
      ...(marketplaceAccountId && { marketplaceAccountId }),
      ...dateRangeFilter(startDate, endDate, 'startedAt')
    };

    const [logs, total] = await Promise.all([
      prisma.syncLog.findMany({
        where,
        include: {
          marketplaceAccount: {
            include: {
              marketplace: {
                select: { name: true, code: true }
              }
            }
          }
        },
        ...pagination,
        orderBy: { startedAt: 'desc' }
      }),
      prisma.syncLog.count({ where })
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      logs,
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
    logger.error('Get sync logs failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get sync logs'
    });
  }
});

/**
 * @swagger
 * /api/sync/queue-stats:
 *   get:
 *     summary: Get queue statistics
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Queue statistics retrieved successfully
 */
router.get('/queue-stats', async (req, res) => {
  try {
    const stats = await getQueueStats();
    
    res.json({ stats });

  } catch (error) {
    logger.error('Get queue stats failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get queue statistics'
    });
  }
});

module.exports = router;
