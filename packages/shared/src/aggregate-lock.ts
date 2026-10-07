import type { RequestContext, TransactionalConnection } from '@vendure/core';

// Backend-only (type imports from @vendure/core). Any registered entity works as the repository
// handle; it only provides the transaction-bound query runner.
const LOCK_ENTITY = 'Channel';

export async function withAggregateLock<T>(
    connection: Pick<TransactionalConnection, 'withTransaction' | 'getRepository'>,
    ctx: RequestContext,
    key: string | number,
    work: (txCtx: RequestContext) => Promise<T>,
): Promise<T> {
    return connection.withTransaction(ctx, async txCtx => {
        await connection
            .getRepository(txCtx, LOCK_ENTITY)
            .query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [String(key)]);
        return work(txCtx);
    });
}
