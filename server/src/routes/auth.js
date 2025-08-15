const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const { prisma } = require('../utils/database');
const { session } = require('../utils/redis');
const { verifyToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - fullName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               fullName:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already exists
 */
router.post('/register', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('fullName')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Full name must be at least 2 characters long'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Valid phone number is required')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password, fullName, phone } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Email already registered'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        fullName,
        phone: phone || null
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        createdAt: true
      }
    });

    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      message: 'User registered successfully',
      user
    });

  } catch (error) {
    logger.error('Registration failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Registration failed'
    });
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Account is deactivated'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password'
      });
    }

    // Generate session ID and JWT token
    const sessionId = uuidv4();
    const token = jwt.sign(
      { 
        userId: user.id,
        sessionId,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Store session in Redis
    const sessionData = {
      userId: user.id,
      email: user.email,
      role: user.role,
      loginTime: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };

    await session.create(sessionId, sessionData, 7 * 24 * 60 * 60); // 7 days

    // Return user data and token
    const userData = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role
    };

    logger.info(`User logged in: ${email}`);

    res.json({
      message: 'Login successful',
      user: userData,
      token,
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

  } catch (error) {
    logger.error('Login failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Login failed'
    });
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         description: Unauthorized
 */
router.post('/logout', verifyToken, async (req, res) => {
  try {
    // Destroy session
    await session.destroy(req.sessionId);

    logger.info(`User logged out: ${req.user.email}`);

    res.json({
      message: 'Logout successful'
    });

  } catch (error) {
    logger.error('Logout failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Logout failed'
    });
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
    }

    res.json({
      user
    });

  } catch (error) {
    logger.error('Get profile failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get user profile'
    });
  }
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/refresh', verifyToken, async (req, res) => {
  try {
    // Generate new session ID and token
    const newSessionId = uuidv4();
    const newToken = jwt.sign(
      { 
        userId: req.user.id,
        sessionId: newSessionId,
        role: req.user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Update session in Redis
    const sessionData = {
      userId: req.user.id,
      email: req.user.email,
      role: req.user.role,
      loginTime: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };

    // Destroy old session and create new one
    await session.destroy(req.sessionId);
    await session.create(newSessionId, sessionData, 7 * 24 * 60 * 60);

    res.json({
      message: 'Token refreshed successfully',
      token: newToken,
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

  } catch (error) {
    logger.error('Token refresh failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Token refresh failed'
    });
  }
});

module.exports = router;
