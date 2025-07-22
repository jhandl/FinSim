module.exports = {
  // Use JSDOM environment for browser-like testing
  testEnvironment: 'jsdom',
  
  // Test file patterns
  testMatch: [
    '**/src/**/*.test.js',
    '**/tests/**/*.test.js'
  ],
  
  // Setup files to run before tests
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/node_modules/**'
  ],
  
  // Module name mapping for absolute imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  

  
  // Global setup
  globals: {
    'window': {},
    'document': {}
  },
  
  // Verbose output for better debugging
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true
};
