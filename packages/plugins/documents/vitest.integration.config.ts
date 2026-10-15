import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/integration/**/*.test.ts'],
        testTimeout: 30_000,
        // Own schema per file: dropSchema on shared `public` races other plugins' parallel suites
        // on the same mivend_test database, so no shared state even across plugins.
    },
});
