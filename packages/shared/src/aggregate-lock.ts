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

// Takes every key's lock in one statement in a fixed hash order, so two batches over overlapping
// keys cannot deadlock. Call inside a transaction, before reading the guarded rows.
export async function lockAggregates(
    connection: Pick<TransactionalConnection, 'getRepository'>,
    txCtx: RequestContext,
    keys: string[],
): Promise<void> {
    if (keys.length === 0) return;
    await connection.getRepository(txCtx, LOCK_ENTITY).query(
        `select pg_advisory_xact_lock(h) from
             (select distinct hashtextextended(k, 0) as h from unnest($1::text[]) as k order by h) s`,
        [keys],
    );
}
