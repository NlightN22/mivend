import { ProductVariant, RequestContext } from '@vendure/core';
import { describe, expect, it } from 'vitest';

import { VARIANT_FACET_RELATIONS, toFacetsAndWeight } from '../../order-preload';

const ctx = { languageCode: 'en' } as unknown as RequestContext;

const categoryValue = {
    code: 'cat-1',
    facet: { code: 'category' },
    translations: [{ languageCode: 'en', name: 'Category one' }],
};

function variant(manufacturer: unknown): ProductVariant {
    return {
        facetValues: [],
        customFields: { weight: 3 },
        product: { facetValues: [categoryValue], customFields: { manufacturer } },
    } as unknown as ProductVariant;
}

describe('toFacetsAndWeight manufacturer entry', () => {
    it('adds one synthetic manufacturer entry keyed by the manufacturer ERP id', () => {
        const { facetValues, weight } = toFacetsAndWeight(
            ctx,
            variant({ externalId: 'maker-1', name: 'Maker One' }),
        );
        expect(weight).toBe(3);
        expect(facetValues).toEqual([
            { facetCode: 'category', valueCode: 'cat-1', name: 'Category one' },
            { facetCode: 'manufacturer', valueCode: 'maker-1', name: 'Maker One' },
        ]);
    });

    it('falls back to the ERP id as name when the manufacturer name is not known yet', () => {
        const { facetValues } = toFacetsAndWeight(
            ctx,
            variant({ externalId: 'maker-1', name: null }),
        );
        expect(facetValues.at(-1)).toEqual({
            facetCode: 'manufacturer',
            valueCode: 'maker-1',
            name: 'maker-1',
        });
    });

    it.each([null, undefined])('adds nothing when the product has no manufacturer (%s)', value => {
        const { facetValues } = toFacetsAndWeight(ctx, variant(value));
        expect(facetValues.map(f => f.facetCode)).toEqual(['category']);
    });

    it('loads the manufacturer through the same variant query as the facets', () => {
        expect(VARIANT_FACET_RELATIONS).toContain('product.customFields.manufacturer');
    });
});
