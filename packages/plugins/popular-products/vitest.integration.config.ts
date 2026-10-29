import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/integration/**/*.test.ts'],
        testTimeout: 30_000,
        // Each file uses its own Postgres schema; dropSchema on the shared public schema would collide
        // This is what lets fileParallelism stay enabled.
    },
});
