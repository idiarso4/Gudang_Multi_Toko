const jwt = require('jsonwebtoken');
const { prisma } = require('../utils/database');
const { session } = require('../utils/redis');
const logger = require('../utils/logger');

// Verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if session exists in Redis
    const sessionData = await session.get(decoded.sessionId);
    if (!sessionData) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Session expired or invalid'
      });
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true
      }
    });

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User account is deactivated'
      });
    }

    // Attach user to request object
    req.user = user;
    req.sessionId = decoded.sessionId;
    
    next();
  } catch (error) {
    logger.error('Token verification failed:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token expired'
      });
    }
    
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication failed'
    });
  }
};

// Check if user has required role
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    }
    
    next();
  };
};

// Check if user is admin
const requireAdmin = requireRole(['ADMIN', 'SUPER_ADMIN']);

// Check if user is super admin
const requireSuperAdmin = requireRole(['SUPER_ADMIN']);

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const sessionData = await session.get(decoded.sessionId);
    if (!sessionData) {
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true
      }
    });

    if (user && user.isActive) {
      req.user = user;
      req.sessionId = decoded.sessionId;
    }
    
    next();
  } catch (error) {
    // Silently fail for optional auth
    next();
  }
};

// Check if user owns the resource or is admin
const requireOwnershipOrAdmin = (getResourceUserId) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      // Super admin and admin can access everything
      if (['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
        return next();
      }

      // Get the user ID that owns the resource
      const resourceUserId = await getResourceUserId(req);
      
      if (!resourceUserId) {
        return res.status(404).json({
          error: 'Not found',
          message: 'Resource not found'
        });
      }

      // Check if user owns the resource
      if (req.user.id !== resourceUserId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Access denied'
        });
      }

      next();
    } catch (error) {
      logger.error('Ownership check failed:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Authorization failed'
      });
    }
  };
};

// Rate limiting per user
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const { rateLimit } = require('../utils/redis');
  
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next();
      }

      const key = `rate_limit:user:${req.user.id}`;
      const windowSeconds = Math.floor(windowMs / 1000);
      
      const requests = await rateLimit.increment(key, windowSeconds);
      
      if (requests > maxRequests) {
        return res.status(429).json({
          error: 'Too many requests',
          message: 'Rate limit exceeded',
          retryAfter: windowSeconds
        });
      }

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': maxRequests,
        'X-RateLimit-Remaining': Math.max(0, maxRequests - requests),
        'X-RateLimit-Reset': new Date(Date.now() + windowMs).toISOString()
      });

      next();
    } catch (error) {
      logger.error('User rate limit check failed:', error);
      next(); // Continue on error
    }
  };
};

module.exports = {
  verifyToken,
  requireRole,
  requireAdmin,
  requireSuperAdmin,
  optionalAuth,
  requireOwnershipOrAdmin,
  userRateLimit
};
