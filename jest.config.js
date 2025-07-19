/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // TA SEKCJA ROZWIĄŻE PROBLEM
  moduleNameMapper: {
    '^../src$': '<rootDir>/src/index.ts'
  }
};
