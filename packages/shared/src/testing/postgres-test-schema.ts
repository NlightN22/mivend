import { DataSource } from 'typeorm';

// The `schema` option only qualifies table names TypeORM generates; hand-written raw SQL
// resolves unqualified names via search_path, so the pool must also set it per connection.
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

// Postgres requires the schema to exist before synchronize can create tables in it.
export async function createTestSchema(schema: string): Promise<void> {
    const bootstrap = new DataSource({ type: 'postgres', ...testDataSourceConnectionOptions() });
    await bootstrap.initialize();
    try {
        await bootstrap.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
        // uuid_generate_v4() id defaults need uuid-ossp, which fresh Postgres images lack. Install it
        // into "public" so it resolves from every per-file schema's search_path. Idempotent.
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
