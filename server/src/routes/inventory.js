const express = require('express');
const { body, validationResult } = require('express-validator');

const { prisma, paginate, searchFilter, transaction } = require('../utils/database');
const { verifyToken, requireOwnershipOrAdmin } = require('../middleware/auth');
const { addInventoryJob } = require('../jobs/queueManager');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication to all routes
router.use(verifyToken);

/**
 * @swagger
 * /api/inventory:
 *   get:
 *     summary: Get inventory for current user
 *     tags: [Inventory]
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
 *         name: lowStock
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: outOfStock
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Inventory retrieved successfully
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search, lowStock, outOfStock } = req.query;
    
    const pagination = paginate(parseInt(page), parseInt(limit));
    
    // Build filters
    let where = {
      product: {
        userId: req.user.id
      }
    };

    // Add search filter
    if (search) {
      where.OR = [
        {
          product: {
            name: {
              contains: search,
              mode: 'insensitive'
            }
          }
        },
        {
          product: {
            sku: {
              contains: search,
              mode: 'insensitive'
            }
          }
        },
        {
          variant: {
            sku: {
              contains: search,
              mode: 'insensitive'
            }
          }
        }
      ];
    }

    // Add stock filters
    if (lowStock === 'true') {
      where.AND = [
        { stockQuantity: { lte: prisma.raw('min_stock_level') } },
        { stockQuantity: { gt: 0 } }
      ];
    }

    if (outOfStock === 'true') {
      where.stockQuantity = { lte: 0 };
    }

    const [inventory, total] = await Promise.all([
      prisma.inventory.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              price: true,
              images: true,
              isActive: true
            }
          },
          variant: {
            select: {
              id: true,
              variantName: true,
              sku: true,
              price: true,
              isActive: true
            }
          }
        },
        ...pagination,
        orderBy: { lastUpdated: 'desc' }
      }),
      prisma.inventory.count({ where })
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      inventory,
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
    logger.error('Get inventory failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get inventory'
    });
  }
});

/**
 * @swagger
 * /api/inventory/{productId}:
 *   get:
 *     summary: Get inventory for specific product
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product inventory retrieved successfully
 *       404:
 *         description: Product not found
 */
router.get('/:productId', requireOwnershipOrAdmin(async (req) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.productId },
    select: { userId: true }
  });
  return product?.userId;
}), async (req, res) => {
  try {
    const { productId } = req.params;

    const inventory = await prisma.inventory.findMany({
      where: { productId },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            price: true,
            images: true
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
      },
      orderBy: { lastUpdated: 'desc' }
    });

    if (inventory.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Product inventory not found'
      });
    }

    res.json({ inventory });

  } catch (error) {
    logger.error('Get product inventory failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get product inventory'
    });
  }
});

/**
 * @swagger
 * /api/inventory/{productId}/update:
 *   patch:
 *     summary: Update product inventory
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
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
 *               - updates
 *             properties:
 *               updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - stockQuantity
 *                     - reason
 *                   properties:
 *                     variantId:
 *                       type: string
 *                     stockQuantity:
 *                       type: integer
 *                     minStockLevel:
 *                       type: integer
 *                     reason:
 *                       type: string
 *     responses:
 *       200:
 *         description: Inventory updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Product not found
 */
router.patch('/:productId/update', [
  body('updates')
    .isArray({ min: 1 })
    .withMessage('At least one update is required'),
  body('updates.*.stockQuantity')
    .isInt({ min: 0 })
    .withMessage('Stock quantity must be a non-negative integer'),
  body('updates.*.minStockLevel')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minimum stock level must be a non-negative integer'),
  body('updates.*.reason')
    .trim()
    .notEmpty()
    .withMessage('Reason is required')
    .isLength({ max: 255 })
    .withMessage('Reason must not exceed 255 characters')
], requireOwnershipOrAdmin(async (req) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.productId },
    select: { userId: true }
  });
  return product?.userId;
}), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { productId } = req.params;
    const { updates } = req.body;

    // Verify product exists
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Product not found'
      });
    }

    // Process updates in transaction
    const result = await transaction(async (tx) => {
      const updatedInventory = [];
      const stockMovements = [];

      for (const update of updates) {
        const { variantId, stockQuantity, minStockLevel, reason } = update;

        // Get current inventory
        const currentInventory = await tx.inventory.findUnique({
          where: {
            productId_variantId: {
              productId,
              variantId: variantId || null
            }
          }
        });

        if (!currentInventory) {
          throw new Error(`Inventory not found for product ${productId}${variantId ? ` variant ${variantId}` : ''}`);
        }

        const stockBefore = currentInventory.stockQuantity;
        const stockDifference = stockQuantity - stockBefore;
        const availableQuantity = Math.max(0, stockQuantity - currentInventory.reservedQuantity);

        // Update inventory
        const updated = await tx.inventory.update({
          where: { id: currentInventory.id },
          data: {
            stockQuantity,
            availableQuantity,
            ...(minStockLevel !== undefined && { minStockLevel })
          }
        });

        updatedInventory.push(updated);

        // Create stock movement record
        if (stockDifference !== 0) {
          const movement = await tx.stockMovement.create({
            data: {
              productId,
              variantId: variantId || null,
              userId: req.user.id,
              movementType: stockDifference > 0 ? 'IN' : 'OUT',
              quantity: Math.abs(stockDifference),
              stockBefore,
              stockAfter: stockQuantity,
              reason
            }
          });

          stockMovements.push(movement);
        }
      }

      return { updatedInventory, stockMovements };
    });

    // Add job to sync inventory to marketplaces
    await addInventoryJob('update-stock', {
      productId,
      userId: req.user.id,
      updates
    });

    logger.info(`Inventory updated for product ${productId} by ${req.user.email}`);

    res.json({
      message: 'Inventory updated successfully',
      inventory: result.updatedInventory,
      stockMovements: result.stockMovements
    });

  } catch (error) {
    logger.error('Update inventory failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update inventory'
    });
  }
});

/**
 * @swagger
 * /api/inventory/low-stock:
 *   get:
 *     summary: Get low stock items
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Low stock items retrieved successfully
 */
router.get('/low-stock', async (req, res) => {
  try {
    const lowStockItems = await prisma.inventory.findMany({
      where: {
        product: {
          userId: req.user.id,
          isActive: true
        },
        stockQuantity: {
          lte: prisma.raw('min_stock_level')
        },
        stockQuantity: {
          gt: 0
        }
      },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            price: true,
            images: true
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
      },
      orderBy: {
        stockQuantity: 'asc'
      }
    });

    res.json({
      lowStockItems,
      count: lowStockItems.length
    });

  } catch (error) {
    logger.error('Get low stock items failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get low stock items'
    });
  }
});

/**
 * @swagger
 * /api/inventory/{productId}/movements:
 *   get:
 *     summary: Get stock movements for a product
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
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
 *         description: Stock movements retrieved successfully
 *       404:
 *         description: Product not found
 */
router.get('/:productId/movements', requireOwnershipOrAdmin(async (req) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.productId },
    select: { userId: true }
  });
  return product?.userId;
}), async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const pagination = paginate(parseInt(page), parseInt(limit));

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where: { productId },
        include: {
          variant: {
            select: {
              id: true,
              variantName: true,
              sku: true
            }
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true
            }
          },
          user: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          }
        },
        ...pagination,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.stockMovement.count({ where: { productId } })
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      movements,
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
    logger.error('Get stock movements failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get stock movements'
    });
  }
});

module.exports = router;
