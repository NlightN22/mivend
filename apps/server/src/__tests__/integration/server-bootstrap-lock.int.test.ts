import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { testDataSourceConnectionOptions } from 'shared';

import { withServerBootstrapLock } from '../../superadmin-bootstrap-lock';

function client(): Client {
    const o = testDataSourceConnectionOptions();
    return new Client({
        host: o.host,
        port: o.port,
        user: o.username,
        password: o.password,
        database: o.database,
    });
}

describe('withServerBootstrapLock (real Postgres)', () => {
    it('never lets two server bootstraps overlap', async () => {
        let running = 0;
        let maxRunning = 0;
        const bootstrap = async (): Promise<void> => {
            running++;
            maxRunning = Math.max(maxRunning, running);
            await new Promise(resolve => setTimeout(resolve, 100));
            running--;
        };
        await Promise.all([
            withServerBootstrapLock(bootstrap, client),
            withServerBootstrapLock(bootstrap, client),
        ]);
        expect(maxRunning).toBe(1);
    });

    it('releases the lock when a bootstrap fails, so the next one starts', async () => {
        await expect(
            withServerBootstrapLock(() => Promise.reject(new Error('boom')), client),
        ).rejects.toThrow('boom');
        await expect(withServerBootstrapLock(async () => 'ok', client)).resolves.toBe('ok');
    });
});
