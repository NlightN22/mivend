import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/integration/**/*.test.ts'],
        testTimeout: 30_000,
        // Each file needs its own Postgres schema; dropSchema on the shared public schema would collide.
        // Isolation via shared testSchemaOptions/createTestSchema is what keeps fileParallelism enabled.
    },
});
