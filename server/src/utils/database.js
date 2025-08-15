const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

// Create Prisma client instance
const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
});

// Log database queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug('Query:', {
      query: e.query,
      params: e.params,
      duration: `${e.duration}ms`,
    });
  });
}

// Log database errors
prisma.$on('error', (e) => {
  logger.error('Database error:', e);
});

// Log database info
prisma.$on('info', (e) => {
  logger.info('Database info:', e.message);
});

// Log database warnings
prisma.$on('warn', (e) => {
  logger.warn('Database warning:', e.message);
});

// Database connection test
const testConnection = async () => {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  }
};

// Graceful shutdown
const disconnect = async () => {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch (error) {
    logger.error('Error disconnecting from database:', error);
  }
};

// Transaction helper
const transaction = async (operations) => {
  try {
    return await prisma.$transaction(operations);
  } catch (error) {
    logger.error('Transaction failed:', error);
    throw error;
  }
};

// Pagination helper
const paginate = (page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  return {
    skip,
    take: limit,
  };
};

// Search helper for text fields
const searchFilter = (searchTerm, fields) => {
  if (!searchTerm) return {};
  
  return {
    OR: fields.map(field => ({
      [field]: {
        contains: searchTerm,
        mode: 'insensitive'
      }
    }))
  };
};

// Date range filter helper
const dateRangeFilter = (startDate, endDate, field = 'createdAt') => {
  const filter = {};
  
  if (startDate || endDate) {
    filter[field] = {};
    if (startDate) {
      filter[field].gte = new Date(startDate);
    }
    if (endDate) {
      filter[field].lte = new Date(endDate);
    }
  }
  
  return filter;
};

// Soft delete helper (if implementing soft deletes)
const softDelete = async (model, id) => {
  try {
    return await prisma[model].update({
      where: { id },
      data: { 
        isActive: false,
        deletedAt: new Date()
      }
    });
  } catch (error) {
    logger.error(`Soft delete failed for ${model}:`, error);
    throw error;
  }
};

// Bulk operations helper
const bulkCreate = async (model, data) => {
  try {
    return await prisma[model].createMany({
      data,
      skipDuplicates: true
    });
  } catch (error) {
    logger.error(`Bulk create failed for ${model}:`, error);
    throw error;
  }
};

const bulkUpdate = async (model, updates) => {
  try {
    const operations = updates.map(({ where, data }) =>
      prisma[model].update({ where, data })
    );
    return await prisma.$transaction(operations);
  } catch (error) {
    logger.error(`Bulk update failed for ${model}:`, error);
    throw error;
  }
};

// Health check for database
const healthCheck = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'healthy',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

// Export everything
module.exports = {
  prisma,
  testConnection,
  disconnect,
  transaction,
  paginate,
  searchFilter,
  dateRangeFilter,
  softDelete,
  bulkCreate,
  bulkUpdate,
  healthCheck
};
