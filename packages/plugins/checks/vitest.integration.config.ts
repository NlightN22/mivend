import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/integration/**/*.test.ts'],
        testTimeout: 30_000,
        // Own Postgres schema per file: dropSchema on shared `public` would clash with parallel test runs
        // Also isolates from other plugins' suites on mivend_test (test:integration runs them in parallel).
    },
});
