import type { Client } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { withSuperadminBootstrapLock } from '../../superadmin-bootstrap-lock';

function fakeClient(ready: boolean, exists: boolean) {
    const query = vi.fn(async (sql: string) => {
        if (sql.includes('to_regclass')) return { rows: [{ ready }] };
        if (sql.includes('pg_advisory_lock')) return { rows: [] };
        return { rows: exists ? [{ '?column?': 1 }] : [] };
    });
    const client = { connect: vi.fn(), end: vi.fn(), query } as unknown as Client;
    return { client, query };
}
const locked = (q: ReturnType<typeof fakeClient>['query']) =>
    q.mock.calls.some(c => String(c[0]).includes('pg_advisory_lock'));

describe('withSuperadminBootstrapLock', () => {
    it('takes the lock when the schema is not created yet', async () => {
        const { client, query } = fakeClient(false, false);
        await withSuperadminBootstrapLock(
            async () => 1,
            'admin',
            () => client,
        );
        expect(locked(query)).toBe(true);
    });

    it('takes the lock when the superadmin is missing', async () => {
        const { client, query } = fakeClient(true, false);
        await withSuperadminBootstrapLock(
            async () => 1,
            'admin',
            () => client,
        );
        expect(locked(query)).toBe(true);
    });

    it('skips the lock once the superadmin exists', async () => {
        const { client, query } = fakeClient(true, true);
        await withSuperadminBootstrapLock(
            async () => 1,
            'admin',
            () => client,
        );
        expect(locked(query)).toBe(false);
    });

    it('closes the connection and rethrows when the work fails', async () => {
        const { client } = fakeClient(true, false);
        await expect(
            withSuperadminBootstrapLock(
                async () => Promise.reject(new Error('boom')),
                'admin',
                () => client,
            ),
        ).rejects.toThrow('boom');
        expect(client.end).toHaveBeenCalled();
    });
});
