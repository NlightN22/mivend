import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { QueryTooLargeError } from './bounded-read';

export interface QueryPage<T> {
    items: T[];
    totalItems: number;
}

// take <= 0 is count-only (TypeORM reads take 0 as no limit); undefined keeps the builder's own limits.
// `hydrate` (joins/selects) runs only when rows are fetched.
export async function getPageAndCount<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    take: number | null | undefined,
    skip?: number | null,
    hydrate?: (qb: SelectQueryBuilder<T>) => void,
): Promise<QueryPage<T>> {
    if (take != null && take <= 0) return { items: [], totalItems: await qb.getCount() };
    hydrate?.(qb);
    if (take != null) qb.take(take);
    if (skip != null) qb.skip(skip);
    const [items, totalItems] = await qb.getManyAndCount();
    return { items, totalItems };
}

export const CAPPED_COUNT_CEILING = 10000;

export interface CappedQueryPage<T> extends QueryPage<T> {
    // True when more than the ceiling matched: totalItems is then the ceiling, read as "at least".
    totalItemsCapped: boolean;
}

export function cappedCountQuery<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    ceiling: number = CAPPED_COUNT_CEILING,
): SelectQueryBuilder<ObjectLiteral> {
    const bounded = qb
        .clone()
        .orderBy()
        .select('1')
        .limit(ceiling + 1);
    // queryRunner is protected, so the count uses the pool, not a caller's transaction; callers here read outside one.
    const counting = qb.connection.createQueryBuilder();
    return counting
        .select('COUNT(*)', 'total')
        .from(`(${bounded.getQuery()})`, 'capped')
        .setParameters(bounded.getParameters());
}

// Paging for big tables: the count stops at the ceiling and a deeper offset fails explicitly (#350 rules).
export async function getPageAndCappedCount<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    take: number,
    skip: number,
    ceiling: number = CAPPED_COUNT_CEILING,
): Promise<CappedQueryPage<T>> {
    if (skip > ceiling) throw new QueryTooLargeError(ceiling);
    const raw = await cappedCountQuery(qb, ceiling).getRawOne<{ total: string }>();
    const counted = Number(raw?.total ?? 0);
    const items = await qb.clone().take(take).skip(skip).getMany();
    return { items, totalItems: Math.min(counted, ceiling), totalItemsCapped: counted > ceiling };
}
