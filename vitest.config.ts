import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'integration', 'access']);
// Anything that mutates module or global state needs its own module cache; the rest shares one per worker, which skips re-importing the same libraries for every file.
const STATEFUL =
    /\bvi\.(mock|doMock|stubGlobal|stubEnv|useFakeTimers|spyOn|resetModules)\(|process\.env(\.\w+|\[[^\]]+\])\s*=[^=]|\bglobal(This)?\.\w+\s*=[^=]/;

function listUnitTests(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        if (SKIP_DIRS.has(entry.name)) return [];
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return listUnitTests(path);
        return entry.name.endsWith('.test.ts') ? [path] : [];
    });
}

const unitFiles = ['packages', 'apps', 'eslint-rules'].flatMap(root =>
    listUnitTests(join(__dirname, root)),
);
const stateful = unitFiles.filter(file => STATEFUL.test(readFileSync(file, 'utf8')));
const shared = unitFiles.filter(file => !stateful.includes(file));

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
        projects: [
            { extends: true, test: { name: 'shared-modules', include: shared, isolate: false } },
            { extends: true, test: { name: 'stateful', include: stateful, isolate: true } },
        ],
    },
});
