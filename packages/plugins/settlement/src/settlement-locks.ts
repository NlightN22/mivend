import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';

export const counterpartyLockKey = (erpId: string): string => `settlement-counterparty:${erpId}`;
export const contractLockKey = (erpId: string): string => `settlement-contract:${erpId}`;
export const orderLockKey = (erpId: string): string => `settlement-order:${erpId}`;

// Keys are taken in sorted order so two writers never wait on each other in a cycle.
export async function withSortedLocks<T>(
    connection: Pick<TransactionalConnection, 'withTransaction' | 'getRepository'>,
    ctx: RequestContext,
    keys: Iterable<string>,
    work: (txCtx: RequestContext) => Promise<T>,
): Promise<T> {
    const sorted = [...new Set(keys)].sort();
    const run = (index: number, current: RequestContext): Promise<T> =>
        index >= sorted.length
            ? work(current)
            : withAggregateLock(connection, current, sorted[index], next => run(index + 1, next));
    return run(0, ctx);
}
