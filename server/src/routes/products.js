const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');

const { prisma, paginate, searchFilter, transaction } = require('../utils/database');
const { verifyToken, requireOwnershipOrAdmin } = require('../middleware/auth');
const { addSyncJob } = require('../jobs/queueManager');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication to all routes
router.use(verifyToken);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_PATH || './uploads');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products for current user
 *     tags: [Products]
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
 *         name: categoryId
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Products retrieved successfully
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search, categoryId, isActive } = req.query;
    
    const pagination = paginate(parseInt(page), parseInt(limit));
    
    // Build filters
    const where = {
      userId: req.user.id,
      ...searchFilter(search, ['name', 'sku', 'description']),
      ...(categoryId && { categoryId }),
      ...(isActive !== undefined && { isActive: isActive === 'true' })
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: {
            select: { id: true, name: true }
          },
          variants: {
            select: {
              id: true,
              variantName: true,
              sku: true,
              price: true,
              isActive: true
            }
          },
          inventory: {
            select: {
              stockQuantity: true,
              availableQuantity: true,
              minStockLevel: true
            }
          },
          marketplaceProducts: {
            select: {
              id: true,
              marketplaceAccount: {
                select: {
                  marketplace: {
                    select: { name: true, code: true }
                  }
                }
              },
              syncStatus: true,
              lastSynced: true
            }
          },
          _count: {
            select: {
              variants: true,
              orderItems: true
            }
          }
        },
        ...pagination,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.product.count({ where })
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      products,
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
    logger.error('Get products failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get products'
    });
  }
});

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Get product by ID
 *     tags: [Products]
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
 *         description: Product retrieved successfully
 *       404:
 *         description: Product not found
 */
router.get('/:id', requireOwnershipOrAdmin(async (req) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    select: { userId: true }
  });
  return product?.userId;
}), async (req, res) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        variants: {
          include: {
            inventory: true,
            marketplaceProducts: {
              include: {
                marketplaceAccount: {
                  include: {
                    marketplace: true
                  }
                }
              }
            }
          }
        },
        inventory: true,
        marketplaceProducts: {
          include: {
            marketplaceAccount: {
              include: {
                marketplace: true
              }
            }
          }
        }
      }
    });

    if (!product) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Product not found'
      });
    }

    res.json({ product });

  } catch (error) {
    logger.error('Get product failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get product'
    });
  }
});

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create new product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sku
 *               - name
 *               - price
 *             properties:
 *               sku:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               cost:
 *                 type: number
 *               weight:
 *                 type: number
 *               categoryId:
 *                 type: string
 *               dimensions:
 *                 type: object
 *               images:
 *                 type: array
 *               attributes:
 *                 type: object
 *               variants:
 *                 type: array
 *               initialStock:
 *                 type: integer
 *               minStockLevel:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Product created successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: SKU already exists
 */
router.post('/', [
  body('sku')
    .trim()
    .notEmpty()
    .withMessage('SKU is required')
    .isLength({ max: 100 })
    .withMessage('SKU must not exceed 100 characters'),
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Product name is required')
    .isLength({ max: 255 })
    .withMessage('Product name must not exceed 255 characters'),
  body('description')
    .optional()
    .trim(),
  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('cost')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Cost must be a positive number'),
  body('weight')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Weight must be a positive number'),
  body('categoryId')
    .optional()
    .isUUID()
    .withMessage('Invalid category ID'),
  body('initialStock')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Initial stock must be a non-negative integer'),
  body('minStockLevel')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minimum stock level must be a non-negative integer')
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
      sku,
      name,
      description,
      price,
      cost,
      weight,
      categoryId,
      dimensions,
      images,
      attributes,
      variants,
      initialStock = 0,
      minStockLevel = 0
    } = req.body;

    // Check if SKU already exists
    const existingSku = await prisma.product.findUnique({
      where: { sku }
    });

    if (existingSku) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'SKU already exists'
      });
    }

    // Create product with inventory in transaction
    const result = await transaction(async (tx) => {
      // Create product
      const product = await tx.product.create({
        data: {
          userId: req.user.id,
          sku,
          name,
          description,
          price,
          cost,
          weight,
          categoryId,
          dimensions,
          images,
          attributes
        }
      });

      // Create inventory
      await tx.inventory.create({
        data: {
          productId: product.id,
          stockQuantity: initialStock,
          availableQuantity: initialStock,
          minStockLevel
        }
      });

      // Create variants if provided
      if (variants && variants.length > 0) {
        for (const variant of variants) {
          const createdVariant = await tx.productVariant.create({
            data: {
              productId: product.id,
              variantName: variant.variantName,
              sku: variant.sku,
              price: variant.price,
              cost: variant.cost,
              attributes: variant.attributes
            }
          });

          // Create inventory for variant
          await tx.inventory.create({
            data: {
              productId: product.id,
              variantId: createdVariant.id,
              stockQuantity: variant.initialStock || 0,
              availableQuantity: variant.initialStock || 0,
              minStockLevel: variant.minStockLevel || 0
            }
          });
        }
      }

      return product;
    });

    logger.info(`Product created: ${result.id} by ${req.user.email}`);

    res.status(201).json({
      message: 'Product created successfully',
      product: result
    });

  } catch (error) {
    logger.error('Create product failed:', error);
    
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'SKU already exists'
      });
    }
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create product'
    });
  }
});

/**
 * @swagger
 * /api/products/{id}/sync:
 *   post:
 *     summary: Sync product to marketplaces
 *     tags: [Products]
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
 *               - marketplaceAccountIds
 *             properties:
 *               marketplaceAccountIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Sync job started successfully
 *       404:
 *         description: Product not found
 */
router.post('/:id/sync', requireOwnershipOrAdmin(async (req) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    select: { userId: true }
  });
  return product?.userId;
}), async (req, res) => {
  try {
    const { id } = req.params;
    const { marketplaceAccountIds } = req.body;

    if (!marketplaceAccountIds || !Array.isArray(marketplaceAccountIds)) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'marketplaceAccountIds array is required'
      });
    }

    const product = await prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Product not found'
      });
    }

    // Add sync job to queue
    const job = await addSyncJob('sync-products', {
      userId: req.user.id,
      productIds: [id],
      marketplaceAccountIds
    });

    logger.info(`Product sync job created: ${job.id} for product ${id}`);

    res.json({
      message: 'Product sync started',
      jobId: job.id
    });

  } catch (error) {
    logger.error('Product sync failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to start product sync'
    });
  }
});

module.exports = router;
