const Queue = require('bull');
const { getRedisClient } = require('../utils/redis');
const logger = require('../utils/logger');

// Job queues
let syncQueue = null;
let inventoryQueue = null;
let orderQueue = null;
let notificationQueue = null;

// Initialize all queues
const initializeQueues = async () => {
  try {
    const redisClient = getRedisClient();
    const redisConfig = {
      redis: {
        port: process.env.REDIS_PORT || 6379,
        host: process.env.REDIS_HOST || 'localhost',
        password: process.env.REDIS_PASSWORD || undefined,
      }
    };

    // Create queues
    syncQueue = new Queue('sync queue', redisConfig);
    inventoryQueue = new Queue('inventory queue', redisConfig);
    orderQueue = new Queue('order queue', redisConfig);
    notificationQueue = new Queue('notification queue', redisConfig);

    // Setup queue processors
    setupSyncProcessor();
    setupInventoryProcessor();
    setupOrderProcessor();
    setupNotificationProcessor();

    // Setup queue event listeners
    setupQueueEventListeners();

    logger.info('All job queues initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize job queues:', error);
    throw error;
  }
};

// Sync queue processor
const setupSyncProcessor = () => {
  syncQueue.process('sync-products', 5, async (job) => {
    const { userId, marketplaceAccountId, productIds } = job.data;
    logger.info(`Processing product sync job for user ${userId}`);
    
    try {
      const { syncProducts } = require('./processors/syncProcessor');
      const result = await syncProducts(userId, marketplaceAccountId, productIds);
      
      // Update job progress
      job.progress(100);
      
      return result;
    } catch (error) {
      logger.error('Product sync job failed:', error);
      throw error;
    }
  });

  syncQueue.process('sync-orders', 3, async (job) => {
    const { userId, marketplaceAccountId, dateRange } = job.data;
    logger.info(`Processing order sync job for user ${userId}`);
    
    try {
      const { syncOrders } = require('./processors/syncProcessor');
      const result = await syncOrders(userId, marketplaceAccountId, dateRange);
      
      job.progress(100);
      return result;
    } catch (error) {
      logger.error('Order sync job failed:', error);
      throw error;
    }
  });

  syncQueue.process('sync-inventory', 5, async (job) => {
    const { userId, marketplaceAccountId, productIds } = job.data;
    logger.info(`Processing inventory sync job for user ${userId}`);
    
    try {
      const { syncInventory } = require('./processors/syncProcessor');
      const result = await syncInventory(userId, marketplaceAccountId, productIds);
      
      job.progress(100);
      return result;
    } catch (error) {
      logger.error('Inventory sync job failed:', error);
      throw error;
    }
  });
};

// Inventory queue processor
const setupInventoryProcessor = () => {
  inventoryQueue.process('update-stock', 10, async (job) => {
    const { productId, variantId, newStock, reason, userId } = job.data;
    logger.info(`Processing stock update for product ${productId}`);
    
    try {
      const { updateStock } = require('./processors/inventoryProcessor');
      const result = await updateStock(productId, variantId, newStock, reason, userId);
      
      job.progress(100);
      return result;
    } catch (error) {
      logger.error('Stock update job failed:', error);
      throw error;
    }
  });

  inventoryQueue.process('check-low-stock', 1, async (job) => {
    const { userId } = job.data;
    logger.info(`Checking low stock for user ${userId}`);
    
    try {
      const { checkLowStock } = require('./processors/inventoryProcessor');
      const result = await checkLowStock(userId);
      
      job.progress(100);
      return result;
    } catch (error) {
      logger.error('Low stock check job failed:', error);
      throw error;
    }
  });
};

// Order queue processor
const setupOrderProcessor = () => {
  orderQueue.process('process-order', 5, async (job) => {
    const { orderId, userId } = job.data;
    logger.info(`Processing order ${orderId}`);
    
    try {
      const { processOrder } = require('./processors/orderProcessor');
      const result = await processOrder(orderId, userId);
      
      job.progress(100);
      return result;
    } catch (error) {
      logger.error('Order processing job failed:', error);
      throw error;
    }
  });

  orderQueue.process('update-order-status', 10, async (job) => {
    const { orderId, status, userId } = job.data;
    logger.info(`Updating order ${orderId} status to ${status}`);
    
    try {
      const { updateOrderStatus } = require('./processors/orderProcessor');
      const result = await updateOrderStatus(orderId, status, userId);
      
      job.progress(100);
      return result;
    } catch (error) {
      logger.error('Order status update job failed:', error);
      throw error;
    }
  });
};

// Notification queue processor
const setupNotificationProcessor = () => {
  notificationQueue.process('send-email', 10, async (job) => {
    const { to, subject, template, data } = job.data;
    logger.info(`Sending email to ${to}`);
    
    try {
      const { sendEmail } = require('./processors/notificationProcessor');
      const result = await sendEmail(to, subject, template, data);
      
      job.progress(100);
      return result;
    } catch (error) {
      logger.error('Email sending job failed:', error);
      throw error;
    }
  });

  notificationQueue.process('send-webhook', 5, async (job) => {
    const { url, payload, headers } = job.data;
    logger.info(`Sending webhook to ${url}`);
    
    try {
      const { sendWebhook } = require('./processors/notificationProcessor');
      const result = await sendWebhook(url, payload, headers);
      
      job.progress(100);
      return result;
    } catch (error) {
      logger.error('Webhook sending job failed:', error);
      throw error;
    }
  });
};

// Setup event listeners for all queues
const setupQueueEventListeners = () => {
  const queues = [syncQueue, inventoryQueue, orderQueue, notificationQueue];
  
  queues.forEach(queue => {
    queue.on('completed', (job, result) => {
      logger.info(`Job ${job.id} completed:`, result);
    });

    queue.on('failed', (job, err) => {
      logger.error(`Job ${job.id} failed:`, err);
    });

    queue.on('stalled', (job) => {
      logger.warn(`Job ${job.id} stalled`);
    });

    queue.on('progress', (job, progress) => {
      logger.debug(`Job ${job.id} progress: ${progress}%`);
    });
  });
};

// Job creation helpers
const addSyncJob = async (type, data, options = {}) => {
  try {
    const job = await syncQueue.add(type, data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 10,
      removeOnFail: 5,
      ...options
    });
    
    logger.info(`Added sync job ${job.id} of type ${type}`);
    return job;
  } catch (error) {
    logger.error('Failed to add sync job:', error);
    throw error;
  }
};

const addInventoryJob = async (type, data, options = {}) => {
  try {
    const job = await inventoryQueue.add(type, data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: 10,
      removeOnFail: 5,
      ...options
    });
    
    logger.info(`Added inventory job ${job.id} of type ${type}`);
    return job;
  } catch (error) {
    logger.error('Failed to add inventory job:', error);
    throw error;
  }
};

const addOrderJob = async (type, data, options = {}) => {
  try {
    const job = await orderQueue.add(type, data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1500,
      },
      removeOnComplete: 10,
      removeOnFail: 5,
      ...options
    });
    
    logger.info(`Added order job ${job.id} of type ${type}`);
    return job;
  } catch (error) {
    logger.error('Failed to add order job:', error);
    throw error;
  }
};

const addNotificationJob = async (type, data, options = {}) => {
  try {
    const job = await notificationQueue.add(type, data, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: 20,
      removeOnFail: 10,
      ...options
    });
    
    logger.info(`Added notification job ${job.id} of type ${type}`);
    return job;
  } catch (error) {
    logger.error('Failed to add notification job:', error);
    throw error;
  }
};

// Get queue statistics
const getQueueStats = async () => {
  try {
    const stats = {};
    const queues = { syncQueue, inventoryQueue, orderQueue, notificationQueue };
    
    for (const [name, queue] of Object.entries(queues)) {
      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();
      
      stats[name] = {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length
      };
    }
    
    return stats;
  } catch (error) {
    logger.error('Failed to get queue stats:', error);
    throw error;
  }
};

module.exports = {
  initializeQueues,
  addSyncJob,
  addInventoryJob,
  addOrderJob,
  addNotificationJob,
  getQueueStats,
  queues: {
    syncQueue: () => syncQueue,
    inventoryQueue: () => inventoryQueue,
    orderQueue: () => orderQueue,
    notificationQueue: () => notificationQueue
  }
};
