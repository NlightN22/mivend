import { Client } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { testDataSourceConnectionOptions } from 'shared';

import { withBootstrapLock } from '../../superadmin-bootstrap-lock';

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

describe('withBootstrapLock (real Postgres)', () => {
    it('never lets two bootstraps overlap', async () => {
        let running = 0;
        let maxRunning = 0;
        const bootstrap = async (): Promise<void> => {
            running++;
            maxRunning = Math.max(maxRunning, running);
            await new Promise(resolve => setTimeout(resolve, 100));
            running--;
        };
        await Promise.all([
            withBootstrapLock(bootstrap, client),
            withBootstrapLock(bootstrap, client),
        ]);
        expect(maxRunning).toBe(1);
    });

    it('releases the lock when a bootstrap fails, so the next one starts', async () => {
        await expect(
            withBootstrapLock(() => Promise.reject(new Error('boom')), client),
        ).rejects.toThrow('boom');
        await expect(withBootstrapLock(async () => 'ok', client)).resolves.toBe('ok');
    });

    it('gives up with an error when a stuck holder does not release in time', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        let release!: () => void;
        const holder = withBootstrapLock(
            () => new Promise<void>(resolve => (release = resolve)),
            client,
        );
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        try {
            await expect(withBootstrapLock(async () => 1, client, 700)).rejects.toThrow(
                /not acquired/,
            );
        } finally {
            release();
            await holder;
        }
    });
});
