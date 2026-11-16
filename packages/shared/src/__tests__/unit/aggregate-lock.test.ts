import { describe, expect, it, Mock, vi } from 'vitest';
import { Logger } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import { tryLockAggregate, withAggregateLock, withClientAggregateLock } from '../../aggregate-lock';

const ctx = { id: 'outer' } as unknown as RequestContext;
const txCtx = { id: 'tx' } as unknown as RequestContext;
interface MakeConnectionResult {
    connection: {
        withTransaction: Mock<
            (c: RequestContext, work: (t: RequestContext) => Promise<unknown>) => Promise<unknown>
        >;
        getRepository: Mock<
            (
                _ctx: RequestContext,
                _entity: string,
            ) => { query: Mock<(_sql: string, _params: string[]) => Promise<void>> }
        >;
    };
    query: Mock<(_sql: string, _params: string[]) => Promise<void>>;
    order: string[];
}

function makeConnection(order: string[] = []): MakeConnectionResult {
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
    it('warns when the lock is held longer than slowHoldWarnMs, and not otherwise', async () => {
        const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
        const { connection } = makeConnection();
        await withAggregateLock(connection as never, ctx, 'ns:1', async () => undefined, {
            slowHoldWarnMs: 20,
        });
        expect(warn).not.toHaveBeenCalled();
        await withAggregateLock(
            connection as never,
            ctx,
            'ns:1',
            () => new Promise(resolve => setTimeout(resolve, 60)),
            { slowHoldWarnMs: 20 },
        );
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"ns:1" held'), 'AggregateLock');
        warn.mockRestore();
    });

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

describe('tryLockAggregate', () => {
    it.each([true, false])('returns the database answer (%s) without waiting', async locked => {
        const query = vi.fn(async (_sql: string, _params: string[]) => [{ locked }]);
        const connection = { getRepository: vi.fn((_ctx: RequestContext) => ({ query })) };
        await expect(tryLockAggregate(connection as never, txCtx, 'ns:1')).resolves.toBe(locked);
        expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_try_advisory_xact_lock'), [
            'ns:1',
        ]);
        expect(connection.getRepository.mock.calls[0][0]).toBe(txCtx);
    });
});

describe('withClientAggregateLock', () => {
    const makeClient = (): { sql: string[]; client: { query: (sql: string) => Promise<void> } } => {
        const sql: string[] = [];
        return { sql, client: { query: async (q: string) => void sql.push(q.split(' ')[0]) } };
    };

    it('locks inside the transaction before the work and commits', async () => {
        const { sql, client } = makeClient();
        const result = await withClientAggregateLock(client, 'ns:1', async () => {
            sql.push('work');
            return 7;
        });
        expect(result).toBe(7);
        expect(sql).toEqual(['BEGIN', 'select', 'work', 'COMMIT']);
    });

    it('rolls back and rethrows when the work fails', async () => {
        const { sql, client } = makeClient();
        await expect(
            withClientAggregateLock(client, 'ns:1', async () => {
                throw new Error('boom');
            }),
        ).rejects.toThrow('boom');
        expect(sql).toEqual(['BEGIN', 'select', 'ROLLBACK']);
    });
});
