import { Client } from 'pg';

import { UTC_SESSION_OPTIONS, useUtcTimestamps } from './pg-utc';
import { resetTwoFactor } from './two-factor-reset';

useUtcTimestamps();

async function main(): Promise<void> {
    const [identifier, ...reasonWords] = process.argv.slice(2);
    const reason = reasonWords.join(' ').trim();
    if (!identifier || !reason) {
        console.error(
            'Usage: two-factor-reset <account email> <reason, free text for the audit log>',
        );
        process.exit(2);
    }
    const client = new Client({
        host: process.env.DB_HOST ?? 'localhost',
        port: parseInt(process.env.DB_PORT ?? '5432'),
        user: process.env.DB_USERNAME ?? 'postgres',
        password: process.env.DB_PASSWORD ?? 'postgres',
        database: process.env.DB_NAME ?? 'mivend',
        options: UTC_SESSION_OPTIONS,
    });
    await client.connect();
    try {
        const outcome = await resetTwoFactor(client, identifier, reason);
        if (!outcome) {
            console.error(`No account with the identifier ${identifier}`);
            process.exit(1);
        }
        console.log(
            `Reset user ${outcome.userId}: ${outcome.factorsRemoved} factor(s), ${outcome.sessionsRemoved} session(s) removed.`,
        );
    } finally {
        await client.end();
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
