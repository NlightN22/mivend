import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            vue: resolve(__dirname, 'packages/ui-kit/node_modules/vue'),
            shared: resolve(__dirname, 'packages/shared/src/index.ts'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'eslint-rules/**/*.test.ts'],
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/__tests__/integration/**',
            '**/__tests__/access/**',
        ],
    },
});
