import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/integration/**/*.test.ts'],
        testTimeout: 30_000,
        // Each file gets its own schema: dropSchema on the shared public schema would let one file's
        // teardown wipe tables other files still use. Use testSchemaOptions/createTestSchema.
    },
});
