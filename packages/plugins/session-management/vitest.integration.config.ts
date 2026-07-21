import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/integration/**/*.test.ts'],
        testTimeout: 30_000,
        // Each file creates its own Postgres schema via shared's testSchemaOptions/
        // createTestSchema instead of `dropSchema: true` against the shared `public` schema —
        // see docs/testing-strategy.md's "Database isolation". This also isolates this plugin's
        // suite from any OTHER plugin's integration tests running concurrently against the same
        // `mivend_test` database (`pnpm --filter "{packages/**}" test:integration` runs plugins
        // in parallel by default) — not just from other files within this same plugin.
    },
});
