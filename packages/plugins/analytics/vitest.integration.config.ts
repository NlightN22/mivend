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
        // Each file needs its own Postgres schema; dropSchema on the shared public schema would collide.
        // Isolation via shared testSchemaOptions/createTestSchema is what keeps fileParallelism enabled.
    },
});
