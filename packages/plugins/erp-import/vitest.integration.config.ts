import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/integration/**/*.test.ts'],
        testTimeout: 30_000,
        // Each file creates its own Postgres schema via shared's testSchemaOptions/
        // createTestSchema instead of a shared `public` schema — see docs/testing-strategy.md's
        // "Database isolation".
    },
});
