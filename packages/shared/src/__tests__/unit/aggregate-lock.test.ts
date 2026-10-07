import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { withAggregateLock } from '../../aggregate-lock';

const ctx = { id: 'outer' } as unknown as RequestContext;
const txCtx = { id: 'tx' } as unknown as RequestContext;

function makeConnection(order: string[] = []) {
    const query = vi.fn(async (_sql: string, _params: string[]) => {
        order.push('lock');
    });
    const connection = {
        withTransaction: vi.fn(
            async (c: RequestContext, work: (t: RequestContext) => Promise<unknown>) => {
                order.push('begin');
                return work(txCtx);
            },
        ),
        getRepository: vi.fn((_ctx: RequestContext, _entity: string) => ({ query })),
    };
    return { connection, query, order };
}

describe('withAggregateLock', () => {
    it('issues the advisory lock inside the transaction before the work runs', async () => {
        const { connection, query, order } = makeConnection();
        await withAggregateLock(connection as never, ctx, 'ns:1', async () => {
            order.push('work');
        });
        expect(order).toEqual(['begin', 'lock', 'work']);
        expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
            'ns:1',
        ]);
        expect(connection.getRepository.mock.calls[0][0]).toBe(txCtx);
    });

    it('hands the transaction context to the work and returns its result', async () => {
        const { connection } = makeConnection();
        const result = await withAggregateLock(connection as never, ctx, 'ns:1', async tx => tx);
        expect(result).toBe(txCtx);
    });

    it('derives a stable key per input and distinct keys per namespace', async () => {
        const { connection, query } = makeConnection();
        await withAggregateLock(connection as never, ctx, 'a:1', async () => undefined);
        await withAggregateLock(connection as never, ctx, 'a:1', async () => undefined);
        await withAggregateLock(connection as never, ctx, 'b:1', async () => undefined);
        await withAggregateLock(connection as never, ctx, 7, async () => undefined);
        const keys = query.mock.calls.map(c => c[1][0]);
        expect(keys).toEqual(['a:1', 'a:1', 'b:1', '7']);
    });

    it('propagates a work error and never swallows it', async () => {
        const { connection } = makeConnection();
        await expect(
            withAggregateLock(connection as never, ctx, 'ns:1', async () => {
                throw new Error('boom');
            }),
        ).rejects.toThrow('boom');
    });

    it('supports nesting: the inner lock runs inside the outer work', async () => {
        const { connection, order } = makeConnection();
        await withAggregateLock(connection as never, ctx, 'outer:1', async tx => {
            await withAggregateLock(connection as never, tx, 'inner:1', async () => {
                order.push('inner-work');
            });
        });
        expect(order).toEqual(['begin', 'lock', 'begin', 'lock', 'inner-work']);
    });
});
