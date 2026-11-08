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
        // Each file gets its own schema: dropSchema on the shared public schema would let one file's
        // teardown wipe tables other files still use. Use testSchemaOptions/createTestSchema.
    },
});
