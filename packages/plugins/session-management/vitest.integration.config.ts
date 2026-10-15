import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/integration/**/*.test.ts'],
        testTimeout: 30_000,
        // Each file gets its own Postgres schema: dropSchema on the shared public schema would race
        // with other plugins' integration tests running in parallel on the same mivend_test database.
    },
});
