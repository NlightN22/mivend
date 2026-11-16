import { grantMissingDefaultPermissions } from '@mivend/plugin-access-control';
import { Client } from 'pg';

import { UTC_SESSION_OPTIONS } from './pg-utc';

export async function runGrantMissingDefaultPermissions(): Promise<void> {
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
        const outcomes = await grantMissingDefaultPermissions(client);
        for (const { roleCode, added } of outcomes) {
            console.log(`Role ${roleCode}: added ${added.join(', ')}`);
        }
        if (outcomes.length === 0) console.log('Default role permissions: nothing to add.');
    } finally {
        await client.end();
    }
}
