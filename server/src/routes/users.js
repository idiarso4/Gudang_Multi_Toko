const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');

const { prisma, paginate, searchFilter } = require('../utils/database');
const { verifyToken, requireAdmin, requireOwnershipOrAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication to all routes
router.use(verifyToken);

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users (Admin only)
 *     tags: [Users]
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
 *         name: role
 *         schema:
 *           type: string
 *           enum: [USER, ADMIN, SUPER_ADMIN]
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *       403:
 *         description: Forbidden
 */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, role, isActive } = req.query;
    
    const pagination = paginate(parseInt(page), parseInt(limit));
    
    // Build filters
    const where = {
      ...searchFilter(search, ['fullName', 'email']),
      ...(role && { role }),
      ...(isActive !== undefined && { isActive: isActive === 'true' })
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              products: true,
              orders: true,
              marketplaceAccounts: true
            }
          }
        },
        ...pagination,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      users,
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
    logger.error('Get users failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get users'
    });
  }
});

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
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
 *         description: User retrieved successfully
 *       404:
 *         description: User not found
 */
router.get('/:id', requireOwnershipOrAdmin(async (req) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true }
  });
  return user?.id;
}), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            products: true,
            orders: true,
            marketplaceAccounts: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
    }

    res.json({ user });

  } catch (error) {
    logger.error('Get user failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get user'
    });
  }
});

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user
 *     tags: [Users]
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
 *               fullName:
 *                 type: string
 *               phone:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [USER, ADMIN, SUPER_ADMIN]
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User updated successfully
 *       404:
 *         description: User not found
 */
router.put('/:id', [
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Full name must be at least 2 characters long'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Valid phone number is required'),
  body('role')
    .optional()
    .isIn(['USER', 'ADMIN', 'SUPER_ADMIN'])
    .withMessage('Invalid role'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
], requireOwnershipOrAdmin(async (req) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true }
  });
  return user?.id;
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
    const { fullName, phone, role, isActive } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id }
    });

    if (!existingUser) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
    }

    // Only admin can change role and isActive
    const updateData = { fullName, phone };
    if (['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      if (role !== undefined) updateData.role = role;
      if (isActive !== undefined) updateData.isActive = isActive;
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        isActive: true,
        updatedAt: true
      }
    });

    logger.info(`User updated: ${id} by ${req.user.email}`);

    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });

  } catch (error) {
    logger.error('Update user failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update user'
    });
  }
});

/**
 * @swagger
 * /api/users/{id}/change-password:
 *   patch:
 *     summary: Change user password
 *     tags: [Users]
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
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid current password
 *       404:
 *         description: User not found
 */
router.patch('/:id/change-password', [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
], requireOwnershipOrAdmin(async (req) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true }
  });
  return user?.id;
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
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
    }

    // Verify current password (skip for admin changing other user's password)
    if (req.user.id === id) {
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Current password is incorrect'
        });
      }
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    await prisma.user.update({
      where: { id },
      data: { password: hashedNewPassword }
    });

    logger.info(`Password changed for user: ${id} by ${req.user.email}`);

    res.json({
      message: 'Password changed successfully'
    });

  } catch (error) {
    logger.error('Change password failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to change password'
    });
  }
});

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete user (Admin only)
 *     tags: [Users]
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
 *         description: User deleted successfully
 *       404:
 *         description: User not found
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
    }

    // Prevent deleting super admin
    if (user.role === 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot delete super admin user'
      });
    }

    // Soft delete by setting isActive to false
    await prisma.user.update({
      where: { id },
      data: { isActive: false }
    });

    logger.info(`User deleted: ${id} by ${req.user.email}`);

    res.json({
      message: 'User deleted successfully'
    });

  } catch (error) {
    logger.error('Delete user failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete user'
    });
  }
});

module.exports = router;
