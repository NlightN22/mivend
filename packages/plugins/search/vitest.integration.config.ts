import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        isolate: false,
        include: ['src/__tests__/integration/**/*.test.ts'],
        testTimeout: 30_000,
    },
});
