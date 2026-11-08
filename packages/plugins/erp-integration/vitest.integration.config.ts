import { readdirSync, readFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import { defineConfig } from 'vitest/config';

const TESTS_DIR = resolve(__dirname, 'src/__tests__/integration');

function listTestFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return listTestFiles(path);
        return entry.name.endsWith('.test.ts') ? [relative(__dirname, path)] : [];
    });
}

// Files that mock modules need their own module cache; all others share one per worker, which skips re-importing the whole Nest/Vendure stack for every file.
const files = listTestFiles(TESTS_DIR);
const mocking = files.filter(file =>
    /\bvi\.(mock|doMock)\(/.test(readFileSync(join(__dirname, file), 'utf8')),
);
const shared = files.filter(file => !mocking.includes(file));

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
        projects: [
            { extends: true, test: { name: 'shared-modules', include: shared, isolate: false } },
            { extends: true, test: { name: 'mocking', include: mocking, isolate: true } },
        ],
    },
});
