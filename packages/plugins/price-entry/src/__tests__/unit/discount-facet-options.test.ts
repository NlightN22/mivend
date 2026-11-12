import { describe, expect, it } from 'vitest';

import { groupFacetOptionRows } from '../../discount-facet-options';

describe('groupFacetOptionRows', () => {
    it('groups ordered rows by facet and keeps facets without values', () => {
        const result = groupFacetOptionRows([
            { facetCode: 'brand', facetName: 'Brand', valueCode: 'a', valueName: 'A' },
            { facetCode: 'brand', facetName: 'Brand', valueCode: 'b', valueName: 'B' },
            { facetCode: 'empty', facetName: 'Empty', valueCode: null, valueName: null },
        ]);
        expect(result).toEqual([
            {
                code: 'brand',
                name: 'Brand',
                values: [
                    { code: 'a', name: 'A' },
                    { code: 'b', name: 'B' },
                ],
            },
            { code: 'empty', name: 'Empty', values: [] },
        ]);
    });

    it('falls back to the code when no translation exists', () => {
        expect(
            groupFacetOptionRows([
                { facetCode: 'f', facetName: null, valueCode: 'v', valueName: null },
            ]),
        ).toEqual([{ code: 'f', name: 'f', values: [{ code: 'v', name: 'v' }] }]);
    });
});
