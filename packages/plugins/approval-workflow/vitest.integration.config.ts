import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/integration/**/*.test.ts'],
        testTimeout: 30_000,
        // Each integration file spins up its own DataSource with synchronize:true/dropSchema:true
        // against the SAME shared TEST_DB_NAME — running files in parallel races two schema syncs
        // against each other (hit as a real "duplicate key value violates unique constraint
        // pg_type_typname_nsp_index" failure once a second integration file was added here).
        fileParallelism: false,
    },
});
