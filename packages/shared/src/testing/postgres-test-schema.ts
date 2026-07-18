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
