import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/integration/**/*.test.ts'],
        testTimeout: 30_000,
        // Both integration files run `dropSchema: true` + `synchronize: true` against the same
        // shared Postgres test database — running them in parallel workers races their DDL
        // against each other (same fix as packages/plugins/acquiring/vitest.integration.config.ts,
        // "duplicate key"/deadlock errors once a second file was added here).
        fileParallelism: false,
    },
});
