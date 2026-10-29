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
        include: ['src/__tests__/bench/**/*.bench-run.ts'],
        testTimeout: 600_000,
        hookTimeout: 600_000,
        fileParallelism: false,
    },
});
