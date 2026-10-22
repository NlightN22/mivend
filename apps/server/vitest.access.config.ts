import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: { alias: { shared: resolve(__dirname, '../../packages/shared/src/index.ts') } },
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/access/**/*.test.ts'],
        globalSetup: ['src/__tests__/access/harness/global-setup.ts'],
        // One shared server and seed; write specs restore what they change, so files run one at a time.
        fileParallelism: false,
        testTimeout: 60_000,
        hookTimeout: 60_000,
    },
});
