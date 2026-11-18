const common = {
  testEnvironment: 'node',
  transform: {},
  modulePathIgnorePatterns: ['<rootDir>/.tools/'],
};

export default {
  testTimeout: 15000,
  projects: [
    {
      ...common,
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
    },
    {
      ...common,
      displayName: 'integration',
      setupFiles: ['<rootDir>/tests/setupEnv.js'],
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
    },
  ],
};
