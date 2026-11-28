import { join, resolve } from 'path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';
import { isolationOptions, listTestFiles } from './vitest-isolation';

const unitFiles = ['packages', 'apps', 'eslint-rules'].flatMap(root =>
    listTestFiles(join(__dirname, root), new Set(['integration', 'access'])),
);

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: [
            { find: 'vue', replacement: resolve(__dirname, 'packages/ui-kit/node_modules/vue') },
            { find: /^shared$/, replacement: resolve(__dirname, 'packages/shared/src/index.ts') },
        ],
    },
    test: {
        globals: true,
        environment: 'node',
        testTimeout: 30_000,
        hookTimeout: 30_000,
        ...isolationOptions(unitFiles, 'packages/**/*.test.ts'),
    },
});
