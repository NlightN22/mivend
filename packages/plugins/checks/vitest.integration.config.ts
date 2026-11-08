import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { isolationOptions, listTestFiles } from '../../../vitest-isolation';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        ...isolationOptions(
            listTestFiles(resolve(__dirname, 'src/__tests__/integration')),
            'src/__tests__/integration/**/*.test.ts',
        ),
        testTimeout: 30_000,
        // Own Postgres schema per file: dropSchema on shared `public` would clash with parallel test runs
        // Also isolates from other plugins' suites on mivend_test (test:integration runs them in parallel).
    },
});
