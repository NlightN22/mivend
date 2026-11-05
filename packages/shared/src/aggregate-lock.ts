import { Logger } from '@vendure/core';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

// Backend-only. Any registered entity works as the repository handle; it only provides the
// transaction-bound query runner.
const LOCK_ENTITY = 'Channel';
const loggerCtx = 'AggregateLock';

export interface AggregateLockOptions {
    // Waiters fail with lock_timeout (never swallowed) instead of holding a pool connection.
    lockTimeoutMs?: number;
    // A holder idle between queries for this long has its session killed and the transaction rolls back.
    idleTimeoutMs?: number;
    // Logs a warning when the lock was held longer than this.
    slowHoldWarnMs?: number;
}

export async function withAggregateLock<T>(
    connection: Pick<TransactionalConnection, 'withTransaction' | 'getRepository'>,
    ctx: RequestContext,
    key: string | number,
    work: (txCtx: RequestContext) => Promise<T>,
    options: AggregateLockOptions = {},
): Promise<T> {
    const { lockTimeoutMs, idleTimeoutMs, slowHoldWarnMs } = options;
    return connection.withTransaction(ctx, async txCtx => {
        const repo = connection.getRepository(txCtx, LOCK_ENTITY);
        if (idleTimeoutMs !== undefined) {
            await repo.query("select set_config('idle_in_transaction_session_timeout', $1, true)", [
                `${idleTimeoutMs}ms`,
            ]);
        }
        if (lockTimeoutMs === undefined) {
            await repo.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
                String(key),
            ]);
        } else {
            // lock_timeout is restored once the lock is held so later row-lock waits are unaffected.
            const [{ previous }] = await repo.query(
                "select current_setting('lock_timeout') as previous",
            );
            await repo.query("select set_config('lock_timeout', $1, true)", [`${lockTimeoutMs}ms`]);
            await repo.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
                String(key),
            ]);
            await repo.query("select set_config('lock_timeout', $1, true)", [previous]);
        }
        const heldSince = Date.now();
        try {
            return await work(txCtx);
        } finally {
            const heldMs = Date.now() - heldSince;
            if (slowHoldWarnMs !== undefined && heldMs > slowHoldWarnMs) {
                Logger.warn(`Aggregate lock "${key}" held for ${heldMs} ms`, loggerCtx);
            }
        }
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
