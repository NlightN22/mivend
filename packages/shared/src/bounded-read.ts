import { GraphQLError } from 'graphql';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { FindManyOptions, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

import { ctxQuery } from './ctx-query';

export const QUERY_TOO_LARGE_CODE = 'QUERY_TOO_LARGE';
export const DEFAULT_READ_CEILING = 1000;
export const KEYSET_BATCH_SIZE = 1000;
export const KEYSET_CEILING = 10000;

// Thrown instead of truncating: a result over the ceiling is a bug to fix, never a partial answer.
export class QueryTooLargeError extends GraphQLError {
    constructor(readonly ceiling: number) {
        super('The request is too large. Contact the developers.', {
            extensions: { code: QUERY_TOO_LARGE_CODE, ceiling },
        });
    }
}

export function assertWithinCeiling<T>(rows: T[], ceiling: number): T[] {
    if (rows.length > ceiling) throw new QueryTooLargeError(ceiling);
    return rows;
}

// Reads ceiling + 1 rows; the extra row is only the signal that the set is over the ceiling.
export async function getManyBounded<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    ceiling: number = DEFAULT_READ_CEILING,
): Promise<T[]> {
    return assertWithinCeiling(await qb.take(ceiling + 1).getMany(), ceiling);
}

export async function getRawManyBounded<R = Record<string, unknown>>(
    qb: SelectQueryBuilder<ObjectLiteral>,
    ceiling: number = DEFAULT_READ_CEILING,
): Promise<R[]> {
    return assertWithinCeiling(await qb.limit(ceiling + 1).getRawMany<R>(), ceiling);
}

export async function findBounded<T extends ObjectLiteral>(
    repo: Repository<T>,
    options: Omit<FindManyOptions<T>, 'take' | 'skip'> = {},
    ceiling: number = DEFAULT_READ_CEILING,
): Promise<T[]> {
    return assertWithinCeiling(await repo.find({ ...options, take: ceiling + 1 }), ceiling);
}

// The SQL must not end in LIMIT/FOR UPDATE: the helper appends `LIMIT ceiling + 1`.
export async function ctxQueryBounded<T = Record<string, unknown>>(
    connection: Pick<TransactionalConnection, 'getRepository'>,
    ctx: RequestContext,
    sql: string,
    params: unknown[] = [],
    ceiling: number = DEFAULT_READ_CEILING,
): Promise<T[]> {
    const text = `${sql.replace(/[\s;]+$/, '')} LIMIT ${ceiling + 1}`;
    return assertWithinCeiling(await ctxQuery<T[]>(connection, ctx, text, params), ceiling);
}

// Reads every row in `id > last` batches; the fetcher must order by id ascending and honour the limit.
export async function* keysetBatches<T extends { id: number | string }>(
    fetchBatch: (afterId: T['id'] | null, limit: number) => Promise<T[]>,
    batchSize: number = KEYSET_BATCH_SIZE,
): AsyncGenerator<T[]> {
    let last: T['id'] | null = null;
    for (;;) {
        const batch: T[] = await fetchBatch(last, batchSize);
        if (batch.length === 0) return;
        yield batch;
        if (batch.length < batchSize) return;
        last = batch[batch.length - 1].id;
    }
}

// Reads the whole set but throws once it passes the ceiling: an emergency brake, not a capacity.
export async function readAllByKeyset<T extends { id: number | string }>(
    fetchBatch: (afterId: T['id'] | null, limit: number) => Promise<T[]>,
    batchSize: number = KEYSET_BATCH_SIZE,
    ceiling: number = KEYSET_CEILING,
): Promise<T[]> {
    const all: T[] = [];
    for await (const batch of keysetBatches(fetchBatch, batchSize)) {
        all.push(...batch);
        if (all.length > ceiling) throw new QueryTooLargeError(ceiling);
    }
    return all;
}
