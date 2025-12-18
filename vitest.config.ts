import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test file patterns - TypeScript tests in test/ts/
    include: ['test/ts/**/*.vitest.ts', 'test/ts/**/*.vitest.js'],

    // Exclude patterns
    exclude: ['node_modules', 'dist', 'examples', 'test/js'],

    // Environment
    environment: 'node',

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts', 'assembly/**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.test.ts', '**/*.vitest.ts'],
    },

    // TypeScript support
    typecheck: {
      tsconfig: './tsconfig.json',
    },

    // Reporter
    reporters: ['default'],

    // Globals for describe, it, expect
    globals: true,
  },

  resolve: {
    alias: {
      // Alias for assembly stubs during testing
      '@assembly': './assembly-stubs',
    },
  },
});
