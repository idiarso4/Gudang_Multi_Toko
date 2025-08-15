const { PrismaClient } = require('@prisma/client');
const Redis = require('ioredis');

// Test database setup
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/gudang_multi_toko_test'
    }
  }
});

// Test Redis setup
const redis = new Redis({
  host: process.env.TEST_REDIS_HOST || 'localhost',
  port: process.env.TEST_REDIS_PORT || 6379,
  db: 1, // Use different database for tests
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3
});

// Global test setup
beforeAll(async () => {
  // Clean up database
  await cleanDatabase();
  
  // Clean up Redis
  await redis.flushdb();
  
  // Run migrations
  await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
});

afterAll(async () => {
  // Clean up after all tests
  await cleanDatabase();
  await redis.flushdb();
  
  // Close connections
  await prisma.$disconnect();
  await redis.quit();
});

beforeEach(async () => {
  // Clean up before each test
  await cleanDatabase();
  await redis.flushdb();
});

afterEach(async () => {
  // Clean up after each test
  await cleanDatabase();
  await redis.flushdb();
});

// Helper function to clean database
async function cleanDatabase() {
  const tablenames = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname='public'
  `;

  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter(name => name !== '_prisma_migrations')
    .map(name => `"public"."${name}"`)
    .join(', ');

  try {
    if (tables.length > 0) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
    }
  } catch (error) {
    console.log({ error });
  }
}

// Test data factories
const createTestUser = async (overrides = {}) => {
  return await prisma.user.create({
    data: {
      fullName: 'Test User',
      email: 'test@example.com',
      password: '$2b$10$hashedpassword', // bcrypt hash for 'password123'
      phone: '081234567890',
      isActive: true,
      ...overrides
    }
  });
};

const createTestMarketplace = async (overrides = {}) => {
  return await prisma.marketplace.create({
    data: {
      name: 'Test Marketplace',
      code: 'TEST',
      apiBaseUrl: 'https://api.test.com',
      isActive: true,
      ...overrides
    }
  });
};

const createTestMarketplaceAccount = async (userId, marketplaceId, overrides = {}) => {
  return await prisma.userMarketplaceAccount.create({
    data: {
      userId,
      marketplaceId,
      storeName: 'Test Store',
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
      isConnected: true,
      ...overrides
    }
  });
};

const createTestProduct = async (userId, overrides = {}) => {
  return await prisma.product.create({
    data: {
      userId,
      name: 'Test Product',
      description: 'Test product description',
      sku: 'TEST-SKU-001',
      price: 100000,
      weight: 500,
      isActive: true,
      ...overrides
    }
  });
};

const createTestProductVariant = async (productId, overrides = {}) => {
  return await prisma.productVariant.create({
    data: {
      productId,
      variantName: 'Test Variant',
      sku: 'TEST-VAR-001',
      price: 110000,
      weight: 500,
      isActive: true,
      ...overrides
    }
  });
};

const createTestOrder = async (userId, marketplaceAccountId, overrides = {}) => {
  return await prisma.order.create({
    data: {
      userId,
      marketplaceAccountId,
      orderNumber: 'TEST-ORDER-001',
      marketplaceOrderId: 'MP-ORDER-001',
      status: 'PENDING',
      totalAmount: 150000,
      shippingCost: 15000,
      customerInfo: {
        name: 'Test Customer',
        email: 'customer@test.com',
        phone: '081234567890'
      },
      shippingAddress: {
        street: 'Test Street 123',
        city: 'Test City',
        state: 'Test State',
        postalCode: '12345',
        country: 'Indonesia'
      },
      orderDate: new Date(),
      ...overrides
    }
  });
};

const createTestOrderItem = async (orderId, productId, overrides = {}) => {
  return await prisma.orderItem.create({
    data: {
      orderId,
      productId,
      sku: 'TEST-SKU-001',
      productName: 'Test Product',
      quantity: 1,
      unitPrice: 100000,
      totalPrice: 100000,
      ...overrides
    }
  });
};

const createTestInventory = async (productId, overrides = {}) => {
  return await prisma.inventory.create({
    data: {
      productId,
      stockQuantity: 100,
      availableQuantity: 100,
      reservedQuantity: 0,
      minStockLevel: 10,
      lastUpdated: new Date(),
      ...overrides
    }
  });
};

// Mock external APIs
const mockShopeeAPI = {
  getProducts: jest.fn(),
  getOrders: jest.fn(),
  updateStock: jest.fn(),
  updateOrderStatus: jest.fn()
};

const mockTokopediaAPI = {
  getProducts: jest.fn(),
  getOrders: jest.fn(),
  updateStock: jest.fn(),
  updateOrderStatus: jest.fn()
};

const mockLazadaAPI = {
  getProducts: jest.fn(),
  getOrders: jest.fn(),
  updateStock: jest.fn(),
  updateOrderStatus: jest.fn()
};

// Helper functions for testing
const generateJWT = (userId) => {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { userId, email: 'test@example.com' },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
};

const makeAuthenticatedRequest = (app, method, url, data = {}, userId = null) => {
  const request = require('supertest');
  const token = generateJWT(userId || 'test-user-id');
  
  let req = request(app)[method.toLowerCase()](url);
  req = req.set('Authorization', `Bearer ${token}`);
  
  if (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT' || method.toUpperCase() === 'PATCH') {
    req = req.send(data);
  }
  
  return req;
};

// Database transaction helper for tests
const withTransaction = async (callback) => {
  return await prisma.$transaction(callback);
};

// Time helpers for testing
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const waitFor = async (condition, timeout = 5000, interval = 100) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return true;
    }
    await sleep(interval);
  }
  throw new Error(`Condition not met within ${timeout}ms`);
};

// Export all test utilities
module.exports = {
  prisma,
  redis,
  cleanDatabase,
  createTestUser,
  createTestMarketplace,
  createTestMarketplaceAccount,
  createTestProduct,
  createTestProductVariant,
  createTestOrder,
  createTestOrderItem,
  createTestInventory,
  mockShopeeAPI,
  mockTokopediaAPI,
  mockLazadaAPI,
  generateJWT,
  makeAuthenticatedRequest,
  withTransaction,
  sleep,
  waitFor
};
