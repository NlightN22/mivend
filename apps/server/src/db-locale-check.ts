import { createDbClient } from './db-client';

// Issue #140: catches a wrongly-provisioned production DB (wrong/missing ICU locale) regardless
// of how it got that way — see docs/environments.md's "Database locale" section.
export async function assertDatabaseLocale(): Promise<void> {
    // CI's plain postgres:16 service has no ICU locale — see docs/environments.md.
    if (process.env.NODE_ENV !== 'production') return;

    const expectedLocale = process.env.DB_EXPECTED_LOCALE;
    if (!expectedLocale) {
        throw new Error(
            'DB_EXPECTED_LOCALE must be set in production (e.g. ru-RU) — see docs/environments.md',
        );
    }

    const client = createDbClient();
    await client.connect();
    try {
        const result = await client.query<{ daticulocale: string | null }>(
            'SELECT daticulocale FROM pg_database WHERE datname = current_database()',
        );
        const actualLocale = result.rows[0]?.daticulocale;
        if (actualLocale !== expectedLocale) {
            throw new Error(
                `Database "${process.env.DB_NAME}" has ICU locale "${actualLocale ?? '(none — not an ICU-locale database)'}"` +
                    `, expected "${expectedLocale}" (DB_EXPECTED_LOCALE) — refusing to start against a` +
                    ' database with the wrong text sort order. See docs/environments.md.',
            );
        }
    } finally {
        await client.end();
    }
}
