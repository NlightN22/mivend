import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { isolationOptions, listTestFiles } from '../../../vitest-isolation';

export default defineConfig({
    resolve: {
        alias: {
            shared: resolve(__dirname, '../../../packages/shared/src/index.ts'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        testTimeout: 30_000,
        ...isolationOptions(
            listTestFiles(resolve(__dirname, 'src/__tests__/integration')),
            'src/__tests__/integration/**/*.test.ts',
        ),
    },
});
