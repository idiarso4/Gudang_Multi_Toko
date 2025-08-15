const express = require('express');
const { body, validationResult } = require('express-validator');

const { prisma, paginate, dateRangeFilter } = require('../utils/database');
const { verifyToken, requireOwnershipOrAdmin } = require('../middleware/auth');
const stockSyncService = require('../services/stockSyncService');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication to all routes
router.use(verifyToken);

/**
 * @swagger
 * /api/stock-sync/rules:
 *   get:
 *     summary: Get user's stock sync rules
 *     tags: [Stock Sync]
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
 *     responses:
 *       200:
 *         description: Sync rules retrieved successfully
 */
router.get('/rules', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pagination = paginate(parseInt(page), parseInt(limit));

    const [rules, total] = await Promise.all([
      prisma.stockSyncRule.findMany({
        where: { userId: req.user.id },
        include: {
          sourceMarketplaceAccount: {
            include: { marketplace: true }
          },
          targetMarketplaceAccounts: {
            include: { 
              marketplaceAccount: {
                include: { marketplace: true }
              }
            }
          },
          _count: {
            select: {
              syncLogs: true
            }
          }
        },
        ...pagination,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.stockSyncRule.count({
        where: { userId: req.user.id }
      })
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      rules,
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
    logger.error('Get sync rules failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get sync rules'
    });
  }
});

/**
 * @swagger
 * /api/stock-sync/rules:
 *   post:
 *     summary: Create new stock sync rule
 *     tags: [Stock Sync]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - syncStrategy
 *               - syncScope
 *               - targetMarketplaceAccountIds
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               syncStrategy:
 *                 type: string
 *                 enum: [EXACT_MATCH, PERCENTAGE, FIXED_OFFSET, MINIMUM_THRESHOLD, CUSTOM_FORMULA]
 *               syncScope:
 *                 type: string
 *                 enum: [ALL_PRODUCTS, SPECIFIC_PRODUCTS, CATEGORY]
 *               targetMarketplaceAccountIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               categoryIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               syncPercentage:
 *                 type: number
 *               syncOffset:
 *                 type: integer
 *               minimumStock:
 *                 type: integer
 *               customFormula:
 *                 type: string
 *     responses:
 *       201:
 *         description: Sync rule created successfully
 *       400:
 *         description: Validation error
 */
router.post('/rules', [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Rule name is required')
    .isLength({ max: 255 })
    .withMessage('Rule name must not exceed 255 characters'),
  body('syncStrategy')
    .isIn(['EXACT_MATCH', 'PERCENTAGE', 'FIXED_OFFSET', 'MINIMUM_THRESHOLD', 'CUSTOM_FORMULA'])
    .withMessage('Invalid sync strategy'),
  body('syncScope')
    .isIn(['ALL_PRODUCTS', 'SPECIFIC_PRODUCTS', 'CATEGORY'])
    .withMessage('Invalid sync scope'),
  body('targetMarketplaceAccountIds')
    .isArray({ min: 1 })
    .withMessage('At least one target marketplace account is required'),
  body('syncPercentage')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Sync percentage must be between 0 and 100'),
  body('syncOffset')
    .optional()
    .isInt()
    .withMessage('Sync offset must be an integer'),
  body('minimumStock')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minimum stock must be a non-negative integer')
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
      name,
      description,
      syncStrategy,
      syncScope,
      targetMarketplaceAccountIds,
      productIds,
      categoryIds,
      syncPercentage,
      syncOffset,
      minimumStock,
      customFormula
    } = req.body;

    // Verify target marketplace accounts belong to user
    const targetAccounts = await prisma.userMarketplaceAccount.findMany({
      where: {
        id: { in: targetMarketplaceAccountIds },
        userId: req.user.id,
        isConnected: true
      }
    });

    if (targetAccounts.length !== targetMarketplaceAccountIds.length) {
      return res.status(400).json({
        error: 'Invalid target marketplace accounts',
        message: 'One or more target marketplace accounts are invalid or not connected'
      });
    }

    // Validate scope-specific requirements
    if (syncScope === 'SPECIFIC_PRODUCTS' && (!productIds || productIds.length === 0)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Product IDs are required for SPECIFIC_PRODUCTS scope'
      });
    }

    if (syncScope === 'CATEGORY' && (!categoryIds || categoryIds.length === 0)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Category IDs are required for CATEGORY scope'
      });
    }

    // Create sync rule
    const rule = await prisma.stockSyncRule.create({
      data: {
        userId: req.user.id,
        name,
        description,
        syncStrategy,
        syncScope,
        productIds: syncScope === 'SPECIFIC_PRODUCTS' ? productIds : null,
        categoryIds: syncScope === 'CATEGORY' ? categoryIds : null,
        syncPercentage,
        syncOffset,
        minimumStock,
        customFormula,
        isActive: true,
        targetMarketplaceAccounts: {
          create: targetMarketplaceAccountIds.map(accountId => ({
            marketplaceAccountId: accountId
          }))
        }
      },
      include: {
        targetMarketplaceAccounts: {
          include: {
            marketplaceAccount: {
              include: { marketplace: true }
            }
          }
        }
      }
    });

    logger.info(`Stock sync rule created: ${rule.id} by user ${req.user.email}`);

    res.status(201).json({
      message: 'Stock sync rule created successfully',
      rule
    });

  } catch (error) {
    logger.error('Create sync rule failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create sync rule'
    });
  }
});

/**
 * @swagger
 * /api/stock-sync/rules/{id}:
 *   put:
 *     summary: Update stock sync rule
 *     tags: [Stock Sync]
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
 *         description: Sync rule updated successfully
 *       404:
 *         description: Rule not found
 */
router.put('/rules/:id', requireOwnershipOrAdmin(async (req) => {
  const rule = await prisma.stockSyncRule.findUnique({
    where: { id: req.params.id },
    select: { userId: true }
  });
  return rule?.userId;
}), [
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Rule name cannot be empty')
    .isLength({ max: 255 })
    .withMessage('Rule name must not exceed 255 characters'),
  body('syncStrategy')
    .optional()
    .isIn(['EXACT_MATCH', 'PERCENTAGE', 'FIXED_OFFSET', 'MINIMUM_THRESHOLD', 'CUSTOM_FORMULA'])
    .withMessage('Invalid sync strategy')
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
    const updateData = req.body;

    // Remove target marketplace accounts update for now (complex operation)
    delete updateData.targetMarketplaceAccountIds;

    const rule = await prisma.stockSyncRule.update({
      where: { id },
      data: updateData,
      include: {
        targetMarketplaceAccounts: {
          include: {
            marketplaceAccount: {
              include: { marketplace: true }
            }
          }
        }
      }
    });

    logger.info(`Stock sync rule updated: ${id} by user ${req.user.email}`);

    res.json({
      message: 'Stock sync rule updated successfully',
      rule
    });

  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Stock sync rule not found'
      });
    }

    logger.error('Update sync rule failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update sync rule'
    });
  }
});

/**
 * @swagger
 * /api/stock-sync/rules/{id}:
 *   delete:
 *     summary: Delete stock sync rule
 *     tags: [Stock Sync]
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
 *         description: Sync rule deleted successfully
 *       404:
 *         description: Rule not found
 */
router.delete('/rules/:id', requireOwnershipOrAdmin(async (req) => {
  const rule = await prisma.stockSyncRule.findUnique({
    where: { id: req.params.id },
    select: { userId: true }
  });
  return rule?.userId;
}), async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.stockSyncRule.delete({
      where: { id }
    });

    logger.info(`Stock sync rule deleted: ${id} by user ${req.user.email}`);

    res.json({
      message: 'Stock sync rule deleted successfully'
    });

  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Stock sync rule not found'
      });
    }

    logger.error('Delete sync rule failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete sync rule'
    });
  }
});

/**
 * @swagger
 * /api/stock-sync/trigger:
 *   post:
 *     summary: Trigger manual stock sync
 *     tags: [Stock Sync]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productIds
 *             properties:
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Manual sync triggered successfully
 */
router.post('/trigger', [
  body('productIds')
    .isArray({ min: 1 })
    .withMessage('At least one product ID is required'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Reason must not exceed 255 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { productIds, reason } = req.body;

    // Verify products belong to user
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        userId: req.user.id
      },
      select: { id: true }
    });

    if (products.length !== productIds.length) {
      return res.status(400).json({
        error: 'Invalid products',
        message: 'One or more products do not belong to you'
      });
    }

    const result = await stockSyncService.triggerManualSync(
      req.user.id,
      productIds,
      { reason }
    );

    logger.info(`Manual sync triggered by user ${req.user.email} for ${productIds.length} products`);

    res.json(result);

  } catch (error) {
    logger.error('Trigger manual sync failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to trigger manual sync'
    });
  }
});

/**
 * @swagger
 * /api/stock-sync/logs:
 *   get:
 *     summary: Get stock sync logs
 *     tags: [Stock Sync]
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
 *         name: ruleId
 *         schema:
 *           type: string
 *       - in: query
 *         name: productId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sync logs retrieved successfully
 */
router.get('/logs', async (req, res) => {
  try {
    const { page = 1, limit = 20, ruleId, productId, startDate, endDate } = req.query;
    const pagination = paginate(parseInt(page), parseInt(limit));

    const where = {
      userId: req.user.id,
      ...(ruleId && { ruleId }),
      ...(productId && { productId }),
      ...dateRangeFilter(startDate, endDate, 'syncedAt')
    };

    const [logs, total] = await Promise.all([
      prisma.stockSyncLog.findMany({
        where,
        include: {
          rule: {
            select: { name: true }
          },
          product: {
            select: { name: true, sku: true }
          },
          variant: {
            select: { variantName: true, sku: true }
          }
        },
        ...pagination,
        orderBy: { syncedAt: 'desc' }
      }),
      prisma.stockSyncLog.count({ where })
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
 * /api/stock-sync/stats:
 *   get:
 *     summary: Get stock sync statistics
 *     tags: [Stock Sync]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d]
 *           default: 24h
 *     responses:
 *       200:
 *         description: Sync statistics retrieved successfully
 */
router.get('/stats', async (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;

    const stats = await stockSyncService.getSyncStats(req.user.id, timeRange);

    res.json({ stats });

  } catch (error) {
    logger.error('Get sync stats failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get sync statistics'
    });
  }
});

module.exports = router;
