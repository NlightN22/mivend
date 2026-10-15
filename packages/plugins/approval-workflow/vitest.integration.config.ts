import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/integration/**/*.test.ts'],
        testTimeout: 30_000,
        // Per-file schemas: a shared `public` schema with dropSchema breaks when test files run in parallel.
        // This is why fileParallelism can stay enabled.
    },
});
