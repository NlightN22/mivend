import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/integration/**/*.test.ts'],
        testTimeout: 30_000,
        // These integration test files each run `dropSchema: true` + `synchronize: true` against
        // the SAME shared Postgres test database (mirroring the real invoice/payment_attempt/
        // settlement_entry table names) — running files in parallel workers races their DDL
        // against each other (real bug: only surfaced once a second/third file using those same
        // table names was added, "duplicate key value violates unique constraint
        // pg_type_typname_nsp_index"). Files within one process still run just fine; only
        // cross-file parallelism is unsafe here.
        fileParallelism: false,
    },
});
