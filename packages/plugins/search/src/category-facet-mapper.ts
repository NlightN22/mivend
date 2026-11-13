import { Collection, Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { categorySlug, getManyBounded } from 'shared';

import type { ResolveQueryFacets } from './search-service.client';
import { loggerCtx } from './types';

export interface ExternalCollectionResult {
    collection: Collection;
    count: number;
}

// Maps search-service's category buckets (ERP ids) to Collections via the cat-<ErpId> slug;
// ids mivend has not synced yet are skipped.
export async function mapFacetsToCollections(
    connection: TransactionalConnection,
    ctx: RequestContext,
    facets: ResolveQueryFacets | undefined,
): Promise<ExternalCollectionResult[]> {
    const categories = (facets?.category ?? []).filter(c => c.count > 0);
    if (categories.length === 0) return [];

    // One collection per slug, so the slug count is the ceiling.
    const collections = await getManyBounded(
        connection
            .getRepository(ctx, Collection)
            .createQueryBuilder('collection')
            .leftJoinAndSelect('collection.translations', 'translations')
            .where('translations.slug IN (:...slugs)', {
                slugs: categories.map(c => categorySlug(c.value)),
            }),
        categories.length,
    );
    const bySlug = new Map(collections.flatMap(c => c.translations.map(t => [t.slug, c] as const)));

    const result: ExternalCollectionResult[] = [];
    for (const { value, count } of categories) {
        const collection = bySlug.get(categorySlug(value));
        if (collection) result.push({ collection, count });
        else Logger.verbose(`category facet ${value} unknown to mivend, skipped`, loggerCtx);
    }
    return result;
}
