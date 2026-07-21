import { DataSource } from 'typeorm';

/**
 * Generates a unique Postgres schema name for one test file, plus the `extra.options` fragment
 * that sets that schema first on the session `search_path` (`schema, public`) for every
 * connection the pool opens. The `schema` DataSourceOptions field alone only affects table names
 * TypeORM itself generates (entity metadata, query builder) — raw SQL strings written by hand in
 * test files (`dataSource.query('TRUNCATE TABLE ...')`, string-based subqueries) resolve
 * unqualified table names via `search_path`, so both are required for full isolation. See
 * docs/testing-strategy.md's "Database isolation" section for why schema-per-file replaces the
 * previous shared-`public`-schema + `fileParallelism: false` workaround.
 */
export function testSchemaOptions(fileTag: string): {
    schema: string;
    extra: { options: string };
} {
    const unique = `${fileTag}_${process.pid}_${Date.now().toString(36)}`.replace(
        /[^a-z0-9_]/gi,
        '_',
    );
    const schema = `test_${unique}`.slice(0, 63);
    return { schema, extra: { options: `-c search_path="${schema}",public` } };
}

/**
 * `synchronize: true` does not create the target schema itself — Postgres requires the schema to
 * exist before tables can be created inside it. Call this before initializing the real
 * per-file DataSource, and {@link dropTestSchema} after `dataSource.destroy()`.
 */
export async function createTestSchema(schema: string): Promise<void> {
    const bootstrap = new DataSource({ type: 'postgres', ...testDataSourceConnectionOptions() });
    await bootstrap.initialize();
    try {
        await bootstrap.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
        // A handful of entities (Reservation, Counterparty, etc.) default their id column to
        // uuid_generate_v4(), which needs the uuid-ossp extension. Extensions are
        // database-scoped, not schema-scoped, so this only needs to run once per database — but
        // it's idempotent (IF NOT EXISTS) and cheap, so it's simplest to just call it here
        // alongside schema creation rather than a separate one-time setup step. Installed into
        // "public" (the default target schema, always the tail of every per-file schema's
        // search_path via testSchemaOptions) so it resolves regardless of which schema is
        // active. Real incident this fixes: neither the CI Postgres service (a vanilla
        // `postgres:16` image) nor a genuinely fresh local `infrastructure/docker/postgres`
        // volume ever created this extension — it only ever worked locally because of leftover
        // state in an old, never-recreated dev volume, which meant `plugin-reservation`'s and
        // `plugin-approval-workflow`'s integration tests had never actually passed in CI.
        await bootstrap.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    } finally {
        await bootstrap.destroy();
    }
}

export async function dropTestSchema(schema: string): Promise<void> {
    const bootstrap = new DataSource({ type: 'postgres', ...testDataSourceConnectionOptions() });
    await bootstrap.initialize();
    try {
        await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
        await bootstrap.destroy();
    }
}

export function testDataSourceConnectionOptions(): {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
} {
    return {
        host: process.env['TEST_DB_HOST'] ?? 'localhost',
        port: Number(process.env['TEST_DB_PORT'] ?? 5432),
        username: process.env['TEST_DB_USER'] ?? 'postgres',
        password: process.env['TEST_DB_PASSWORD'] ?? 'postgres',
        database: process.env['TEST_DB_NAME'] ?? 'mivend_test',
    };
}
