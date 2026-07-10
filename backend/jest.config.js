module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // nanoid (et quelques autres deps) sont publiées en ESM pur ; sans cette
  // exception, Jest refuse de les transformer et tout fichier qui les importe
  // (même indirectement, via un service) plante avec "Cannot use import
  // statement outside a module".
  transformIgnorePatterns: ['node_modules/(?!(nanoid)/)'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts'],
  setupFiles: ['dotenv/config'],
};
