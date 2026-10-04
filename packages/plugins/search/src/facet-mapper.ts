import { FacetValue, Logger, RequestContext, TransactionalConnection } from '@vendure/core';

import type { ResolveQueryFacets } from './search-service.client';
import { loggerCtx } from './types';

export interface ExternalFacetValueResult {
    facetValue: FacetValue;
    count: number;
}

// Maps search-service's manufacturer facet back to mivend FacetValues by code; values mivend
// has not synced yet, or that still carry only their ERP id as a name, are skipped.
export async function mapFacetsToFacetValues(
    connection: TransactionalConnection,
    ctx: RequestContext,
    facets: ResolveQueryFacets | undefined,
): Promise<ExternalFacetValueResult[]> {
    const manufacturers = facets?.manufacturer ?? [];
    if (manufacturers.length === 0) return [];

    const values = await connection
        .getRepository(ctx, FacetValue)
        .createQueryBuilder('fv')
        .leftJoinAndSelect('fv.facet', 'facet')
        .leftJoinAndSelect('fv.translations', 'translations')
        .leftJoinAndSelect('facet.translations', 'facetTranslations')
        .where('facet.code = :facetCode', { facetCode: 'manufacturer' })
        .andWhere('fv.code IN (:...codes)', { codes: manufacturers.map(m => m.value) })
        .getMany();
    const byCode = new Map(values.map(v => [v.code, v]));

    const result: ExternalFacetValueResult[] = [];
    for (const { value, count } of manufacturers) {
        const facetValue = byCode.get(value);
        if (facetValue && hasRealName(facetValue)) result.push({ facetValue, count });
        else if (facetValue)
            Logger.verbose(`manufacturer facet ${value} has no name yet, skipped`, loggerCtx);
        else Logger.verbose(`manufacturer facet ${value} unknown to mivend, skipped`, loggerCtx);
    }
    return result;
}

function hasRealName(facetValue: FacetValue): boolean {
    return facetValue.translations.some(t => t.name !== '' && t.name !== facetValue.code);
}
