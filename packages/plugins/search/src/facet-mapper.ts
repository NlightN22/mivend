import { FacetValue, Logger, RequestContext, TransactionalConnection } from '@vendure/core';

import { characteristicFacetCode } from 'shared';

import type { ResolveQueryFacets } from './search-service.client';
import { loggerCtx } from './types';

export interface ExternalFacetValueResult {
    facetValue: FacetValue;
    count: number;
}

// Maps search-service's manufacturer and characteristic facets back to FacetValues; values mivend
// has not synced yet (or that only carry their ERP id as a name) are skipped.
export async function mapFacetsToFacetValues(
    connection: TransactionalConnection,
    ctx: RequestContext,
    facets: ResolveQueryFacets | undefined,
): Promise<ExternalFacetValueResult[]> {
    return [
        ...(await mapManufacturers(connection, ctx, facets)),
        ...(await mapCharacteristics(connection, ctx, facets)),
    ];
}

async function mapManufacturers(
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

async function mapCharacteristics(
    connection: TransactionalConnection,
    ctx: RequestContext,
    facets: ResolveQueryFacets | undefined,
): Promise<ExternalFacetValueResult[]> {
    const entries = (facets?.characteristics ?? []).filter(e => e.count > 0);
    if (entries.length === 0) return [];

    const values = await connection
        .getRepository(ctx, FacetValue)
        .createQueryBuilder('fv')
        .leftJoinAndSelect('fv.facet', 'facet')
        .leftJoinAndSelect('fv.translations', 'translations')
        .leftJoinAndSelect('facet.translations', 'facetTranslations')
        .where('facet.code IN (:...facetCodes)', {
            facetCodes: [...new Set(entries.map(e => characteristicFacetCode(e.key)))],
        })
        .andWhere('fv.code IN (:...codes)', { codes: [...new Set(entries.map(e => e.normalized))] })
        .getMany();
    const byKey = new Map(values.map(v => [`${v.facet.code}\u0000${v.code}`, v]));

    const result: ExternalFacetValueResult[] = [];
    for (const { key, normalized, count } of entries) {
        const facetValue = byKey.get(`${characteristicFacetCode(key)}\u0000${normalized}`);
        if (facetValue) result.push({ facetValue, count });
        else
            Logger.verbose(`characteristic facet ${key}=${normalized} unknown, skipped`, loggerCtx);
    }
    return result;
}

function hasRealName(facetValue: FacetValue): boolean {
    return facetValue.translations.some(t => t.name !== '' && t.name !== facetValue.code);
}
