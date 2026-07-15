import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/integration/**/*.test.ts'],
        testTimeout: 30_000,
        // Same reasoning as approval-workflow's config: each integration file spins up its own
        // DataSource with synchronize:true/dropSchema:true against the same shared TEST_DB_NAME.
        fileParallelism: false,
    },
});
