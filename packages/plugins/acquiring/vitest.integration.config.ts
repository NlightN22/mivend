import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/integration/**/*.test.ts'],
        testTimeout: 30_000,
        // Each file uses its own Postgres schema, so files never race on shared DDL and can run in parallel.
        // Do not use dropSchema: true on the shared public schema; it reintroduces the race.
    },
});
