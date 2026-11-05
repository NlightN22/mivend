import type { RequestContext, TransactionalConnection } from '@vendure/core';

// Backend-only (type imports from @vendure/core). Any registered entity works as the repository
// handle; it only provides the transaction-bound query runner.
const LOCK_ENTITY = 'Channel';
const IDLE_IN_TRANSACTION_TIMEOUT_MS = 60_000;

export async function withAggregateLock<T>(
    connection: Pick<TransactionalConnection, 'withTransaction' | 'getRepository'>,
    ctx: RequestContext,
    key: string | number,
    work: (txCtx: RequestContext) => Promise<T>,
    lockTimeoutMs?: number,
): Promise<T> {
    return connection.withTransaction(ctx, async txCtx => {
        const repo = connection.getRepository(txCtx, LOCK_ENTITY);
        if (lockTimeoutMs === undefined) {
            await repo.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
                String(key),
            ]);
            return work(txCtx);
        }
        // Waiters fail with lock_timeout (never swallowed) and a holder idle between queries is cut off;
        // lock_timeout is restored once the lock is held so later row-lock waits are unaffected.
        const [{ previous }] = await repo.query(
            "select current_setting('lock_timeout') as previous",
        );
        await repo.query(
            "select set_config('lock_timeout', $1, true), set_config('idle_in_transaction_session_timeout', $2, true)",
            [`${lockTimeoutMs}ms`, `${IDLE_IN_TRANSACTION_TIMEOUT_MS}ms`],
        );
        await repo.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [String(key)]);
        await repo.query("select set_config('lock_timeout', $1, true)", [previous]);
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
