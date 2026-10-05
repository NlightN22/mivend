import type { FacetValue, RequestContext, TransactionalConnection } from '@vendure/core';
import { describe, expect, it } from 'vitest';

import { mapFacetsToFacetValues } from '../../facet-mapper';

function connectionReturning(values: unknown[]): TransactionalConnection {
    const qb = {
        leftJoinAndSelect: () => qb,
        where: () => qb,
        andWhere: () => qb,
        getMany: async () => values,
    };
    return { getRepository: () => ({ createQueryBuilder: () => qb }) } as never;
}

const fv = (code: string, name: string): FacetValue =>
    ({ code, translations: [{ name }] }) as unknown as FacetValue;

describe('mapFacetsToFacetValues', () => {
    it('skips manufacturers whose only name is their ERP id', async () => {
        const conn = connectionReturning([fv('m-1', 'Acme'), fv('m-2', 'm-2')]);
        const result = await mapFacetsToFacetValues(
            conn,
            {} as RequestContext,
            {
                manufacturer: [
                    { value: 'm-1', count: 3 },
                    { value: 'm-2', count: 5 },
                    { value: 'm-3', count: 1 },
                ],
            } as never,
        );
        expect(result.map(r => r.facetValue.code)).toEqual(['m-1']);
    });

    it('maps characteristic buckets to facet values by key facet and value code', async () => {
        const typeFv = {
            code: 'синтетическое',
            facet: { code: 'characteristic:Тип' },
            translations: [{ name: 'синтетическое' }],
        } as unknown as FacetValue;
        const conn = connectionReturning([typeFv]);
        const result = await mapFacetsToFacetValues(
            conn,
            {} as RequestContext,
            {
                manufacturer: [],
                characteristics: [
                    { key: 'Тип', normalized: 'синтетическое', count: 325 },
                    { key: 'Тип', normalized: 'неизвестное', count: 2 },
                    { key: 'Сезонность', normalized: 'летние', count: 0 },
                ],
            } as never,
        );
        expect(result).toEqual([{ facetValue: typeFv, count: 325 }]);
    });
});
