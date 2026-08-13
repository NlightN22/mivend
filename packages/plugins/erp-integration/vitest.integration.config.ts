import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            shared: resolve(__dirname, '../../../packages/shared/src/index.ts'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/integration/**/*.test.ts'],
        testTimeout: 30_000,
    },
});
