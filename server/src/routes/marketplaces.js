const express = require('express');
const { body, validationResult } = require('express-validator');

const { prisma } = require('../utils/database');
const { verifyToken, requireOwnershipOrAdmin } = require('../middleware/auth');
const { cache } = require('../utils/redis');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication to all routes
router.use(verifyToken);

/**
 * @swagger
 * /api/marketplaces:
 *   get:
 *     summary: Get all available marketplaces
 *     tags: [Marketplaces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Marketplaces retrieved successfully
 */
router.get('/', async (req, res) => {
  try {
    // Try to get from cache first
    const cacheKey = 'marketplaces:all';
    let marketplaces = await cache.get(cacheKey);

    if (!marketplaces) {
      marketplaces = await prisma.marketplace.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          code: true,
          config: true,
          createdAt: true
        },
        orderBy: { name: 'asc' }
      });

      // Cache for 1 hour
      await cache.set(cacheKey, marketplaces, 3600);
    }

    res.json({ marketplaces });

  } catch (error) {
    logger.error('Get marketplaces failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get marketplaces'
    });
  }
});

/**
 * @swagger
 * /api/marketplaces/accounts:
 *   get:
 *     summary: Get user's marketplace accounts
 *     tags: [Marketplaces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Marketplace accounts retrieved successfully
 */
router.get('/accounts', async (req, res) => {
  try {
    const accounts = await prisma.userMarketplaceAccount.findMany({
      where: { userId: req.user.id },
      include: {
        marketplace: {
          select: {
            id: true,
            name: true,
            code: true,
            config: true
          }
        },
        _count: {
          select: {
            marketplaceProducts: true,
            orders: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Remove sensitive credentials from response
    const sanitizedAccounts = accounts.map(account => ({
      ...account,
      apiKey: account.apiKey ? '***' : null,
      apiSecret: account.apiSecret ? '***' : null,
      credentials: account.credentials ? '***' : null
    }));

    res.json({ accounts: sanitizedAccounts });

  } catch (error) {
    logger.error('Get marketplace accounts failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get marketplace accounts'
    });
  }
});

/**
 * @swagger
 * /api/marketplaces/accounts/{id}:
 *   get:
 *     summary: Get marketplace account by ID
 *     tags: [Marketplaces]
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
 *         description: Marketplace account retrieved successfully
 *       404:
 *         description: Account not found
 */
router.get('/accounts/:id', requireOwnershipOrAdmin(async (req) => {
  const account = await prisma.userMarketplaceAccount.findUnique({
    where: { id: req.params.id },
    select: { userId: true }
  });
  return account?.userId;
}), async (req, res) => {
  try {
    const { id } = req.params;

    const account = await prisma.userMarketplaceAccount.findUnique({
      where: { id },
      include: {
        marketplace: true,
        _count: {
          select: {
            marketplaceProducts: true,
            orders: true,
            syncLogs: true
          }
        }
      }
    });

    if (!account) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Marketplace account not found'
      });
    }

    // Remove sensitive credentials from response
    const sanitizedAccount = {
      ...account,
      apiKey: account.apiKey ? '***' : null,
      apiSecret: account.apiSecret ? '***' : null,
      credentials: account.credentials ? '***' : null
    };

    res.json({ account: sanitizedAccount });

  } catch (error) {
    logger.error('Get marketplace account failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get marketplace account'
    });
  }
});

/**
 * @swagger
 * /api/marketplaces/connect:
 *   post:
 *     summary: Connect to a marketplace
 *     tags: [Marketplaces]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - marketplaceId
 *               - storeName
 *             properties:
 *               marketplaceId:
 *                 type: string
 *               storeName:
 *                 type: string
 *               apiKey:
 *                 type: string
 *               apiSecret:
 *                 type: string
 *               credentials:
 *                 type: object
 *     responses:
 *       201:
 *         description: Marketplace connected successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Marketplace already connected
 */
router.post('/connect', [
  body('marketplaceId')
    .isUUID()
    .withMessage('Valid marketplace ID is required'),
  body('storeName')
    .trim()
    .notEmpty()
    .withMessage('Store name is required')
    .isLength({ max: 255 })
    .withMessage('Store name must not exceed 255 characters'),
  body('apiKey')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('API key must not exceed 500 characters'),
  body('apiSecret')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('API secret must not exceed 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { marketplaceId, storeName, apiKey, apiSecret, credentials } = req.body;

    // Check if marketplace exists
    const marketplace = await prisma.marketplace.findUnique({
      where: { id: marketplaceId, isActive: true }
    });

    if (!marketplace) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Marketplace not found'
      });
    }

    // Check if user already connected to this marketplace
    const existingAccount = await prisma.userMarketplaceAccount.findUnique({
      where: {
        userId_marketplaceId: {
          userId: req.user.id,
          marketplaceId
        }
      }
    });

    if (existingAccount) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Already connected to this marketplace'
      });
    }

    // Create marketplace account
    const account = await prisma.userMarketplaceAccount.create({
      data: {
        userId: req.user.id,
        marketplaceId,
        storeName,
        apiKey,
        apiSecret,
        credentials,
        isConnected: false // Will be set to true after successful test
      },
      include: {
        marketplace: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      }
    });

    logger.info(`Marketplace account created: ${account.id} for user ${req.user.email}`);

    // Remove sensitive data from response
    const sanitizedAccount = {
      ...account,
      apiKey: account.apiKey ? '***' : null,
      apiSecret: account.apiSecret ? '***' : null,
      credentials: account.credentials ? '***' : null
    };

    res.status(201).json({
      message: 'Marketplace account created successfully',
      account: sanitizedAccount
    });

  } catch (error) {
    logger.error('Connect marketplace failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to connect marketplace'
    });
  }
});

/**
 * @swagger
 * /api/marketplaces/accounts/{id}:
 *   put:
 *     summary: Update marketplace account
 *     tags: [Marketplaces]
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
 *               storeName:
 *                 type: string
 *               apiKey:
 *                 type: string
 *               apiSecret:
 *                 type: string
 *               credentials:
 *                 type: object
 *     responses:
 *       200:
 *         description: Marketplace account updated successfully
 *       404:
 *         description: Account not found
 */
router.put('/accounts/:id', [
  body('storeName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Store name cannot be empty')
    .isLength({ max: 255 })
    .withMessage('Store name must not exceed 255 characters'),
  body('apiKey')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('API key must not exceed 500 characters'),
  body('apiSecret')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('API secret must not exceed 500 characters')
], requireOwnershipOrAdmin(async (req) => {
  const account = await prisma.userMarketplaceAccount.findUnique({
    where: { id: req.params.id },
    select: { userId: true }
  });
  return account?.userId;
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
    const { storeName, apiKey, apiSecret, credentials } = req.body;

    const account = await prisma.userMarketplaceAccount.findUnique({
      where: { id }
    });

    if (!account) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Marketplace account not found'
      });
    }

    // Update account
    const updatedAccount = await prisma.userMarketplaceAccount.update({
      where: { id },
      data: {
        ...(storeName && { storeName }),
        ...(apiKey !== undefined && { apiKey }),
        ...(apiSecret !== undefined && { apiSecret }),
        ...(credentials !== undefined && { credentials }),
        // Reset connection status if credentials changed
        ...(apiKey !== undefined || apiSecret !== undefined || credentials !== undefined) && {
          isConnected: false,
          lastSync: null
        }
      },
      include: {
        marketplace: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      }
    });

    logger.info(`Marketplace account updated: ${id} by ${req.user.email}`);

    // Remove sensitive data from response
    const sanitizedAccount = {
      ...updatedAccount,
      apiKey: updatedAccount.apiKey ? '***' : null,
      apiSecret: updatedAccount.apiSecret ? '***' : null,
      credentials: updatedAccount.credentials ? '***' : null
    };

    res.json({
      message: 'Marketplace account updated successfully',
      account: sanitizedAccount
    });

  } catch (error) {
    logger.error('Update marketplace account failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update marketplace account'
    });
  }
});

/**
 * @swagger
 * /api/marketplaces/accounts/{id}/test:
 *   post:
 *     summary: Test marketplace connection
 *     tags: [Marketplaces]
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
 *         description: Connection test successful
 *       400:
 *         description: Connection test failed
 *       404:
 *         description: Account not found
 */
router.post('/accounts/:id/test', requireOwnershipOrAdmin(async (req) => {
  const account = await prisma.userMarketplaceAccount.findUnique({
    where: { id: req.params.id },
    select: { userId: true }
  });
  return account?.userId;
}), async (req, res) => {
  try {
    const { id } = req.params;

    const account = await prisma.userMarketplaceAccount.findUnique({
      where: { id },
      include: {
        marketplace: true
      }
    });

    if (!account) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Marketplace account not found'
      });
    }

    // TODO: Implement actual marketplace API testing
    // For now, we'll simulate a test
    const testResult = await testMarketplaceConnection(account);

    if (testResult.success) {
      // Update connection status
      await prisma.userMarketplaceAccount.update({
        where: { id },
        data: {
          isConnected: true,
          lastSync: new Date()
        }
      });

      logger.info(`Marketplace connection test successful: ${id}`);

      res.json({
        message: 'Connection test successful',
        result: testResult
      });
    } else {
      logger.warn(`Marketplace connection test failed: ${id} - ${testResult.error}`);

      res.status(400).json({
        error: 'Connection test failed',
        message: testResult.error
      });
    }

  } catch (error) {
    logger.error('Test marketplace connection failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to test marketplace connection'
    });
  }
});

/**
 * @swagger
 * /api/marketplaces/accounts/{id}:
 *   delete:
 *     summary: Disconnect marketplace account
 *     tags: [Marketplaces]
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
 *         description: Marketplace account disconnected successfully
 *       404:
 *         description: Account not found
 */
router.delete('/accounts/:id', requireOwnershipOrAdmin(async (req) => {
  const account = await prisma.userMarketplaceAccount.findUnique({
    where: { id: req.params.id },
    select: { userId: true }
  });
  return account?.userId;
}), async (req, res) => {
  try {
    const { id } = req.params;

    const account = await prisma.userMarketplaceAccount.findUnique({
      where: { id }
    });

    if (!account) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Marketplace account not found'
      });
    }

    // Delete the account (this will cascade delete related records)
    await prisma.userMarketplaceAccount.delete({
      where: { id }
    });

    logger.info(`Marketplace account deleted: ${id} by ${req.user.email}`);

    res.json({
      message: 'Marketplace account disconnected successfully'
    });

  } catch (error) {
    logger.error('Disconnect marketplace account failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to disconnect marketplace account'
    });
  }
});

// Helper function to test marketplace connection
async function testMarketplaceConnection(account) {
  try {
    // This is a placeholder implementation
    // In a real application, you would implement specific API calls for each marketplace
    
    const { marketplace, apiKey, apiSecret, credentials } = account;
    
    if (!apiKey && !credentials) {
      return {
        success: false,
        error: 'API credentials are required'
      };
    }

    // Simulate API call based on marketplace
    switch (marketplace.code) {
      case 'SHOPEE':
        // Implement Shopee API test
        return { success: true, message: 'Shopee connection successful' };
      
      case 'TOKOPEDIA':
        // Implement Tokopedia API test
        return { success: true, message: 'Tokopedia connection successful' };
      
      case 'LAZADA':
        // Implement Lazada API test
        return { success: true, message: 'Lazada connection successful' };
      
      default:
        return { success: true, message: 'Connection test passed' };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = router;
