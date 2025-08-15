module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: [
    '<rootDir>/tests/**/*.test.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/config/**',
    '!src/utils/logger.js',
    '!src/integrations/MarketplaceFactory.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json'
  ],
  testTimeout: 30000,
  verbose: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  maxWorkers: 1, // Run tests sequentially to avoid database conflicts
  forceExit: true,
  detectOpenHandles: true
};
