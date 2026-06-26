import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            shared: resolve(__dirname, 'packages/shared/src/index.ts'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    },
});
