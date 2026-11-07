import type { Client } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { withBootstrapLock } from '../../superadmin-bootstrap-lock';

function fakeClient(...attempts: boolean[]) {
    const query = vi.fn(async () => ({ rows: [{ locked: attempts.shift() ?? true }] }));
    const client = { connect: vi.fn(), end: vi.fn(), query } as unknown as Client;
    return { client, query };
}

describe('withBootstrapLock', () => {
    it('runs the work under the lock and closes the connection', async () => {
        const { client, query } = fakeClient(true);
        await expect(
            withBootstrapLock(
                async () => 'done',
                () => client,
            ),
        ).resolves.toBe('done');
        expect(query).toHaveBeenCalledTimes(1);
        expect(client.end).toHaveBeenCalled();
    });

    it('keeps polling while another process holds the lock, then runs', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { client, query } = fakeClient(false, false, true);
        await withBootstrapLock(
            async () => 1,
            () => client,
            10_000,
        );
        expect(query).toHaveBeenCalledTimes(3);
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('fails loudly and never runs the work when the lock is not acquired in time', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { client } = fakeClient(...Array(50).fill(false));
        const work = vi.fn(async () => 1);
        await expect(withBootstrapLock(work, () => client, 600)).rejects.toThrow(
            /not acquired within 600 ms/,
        );
        expect(work).not.toHaveBeenCalled();
        expect(client.end).toHaveBeenCalled();
    });

    it('closes the connection and rethrows when the work fails', async () => {
        const { client } = fakeClient(true);
        await expect(
            withBootstrapLock(
                async () => Promise.reject(new Error('boom')),
                () => client,
            ),
        ).rejects.toThrow('boom');
        expect(client.end).toHaveBeenCalled();
    });
});
