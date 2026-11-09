import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

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
