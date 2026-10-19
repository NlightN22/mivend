import type { RequestContext, TransactionalConnection } from '@vendure/core';

// Runs on the ctx transaction's query runner; any registered entity is just the repository handle.
export function ctxQuery<T = unknown>(
    connection: Pick<TransactionalConnection, 'getRepository'>,
    ctx: RequestContext,
    sql: string,
    params?: unknown[],
): Promise<T> {
    return connection.getRepository(ctx, 'Channel').query(sql, params) as Promise<T>;
}
