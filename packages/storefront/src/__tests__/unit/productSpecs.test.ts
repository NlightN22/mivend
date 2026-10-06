import { describe, it, expect } from 'vitest';
import { facetSpecs } from '../../utils/productSpecs';

const fv = (code: string, facetName: string, name: string) => ({
    name,
    facet: { code, name: facetName },
});

describe('facetSpecs', () => {
    it('skips category and brand, which the page shows separately', () => {
        expect(
            facetSpecs([fv('category', 'Category', 'Rollers'), fv('brand', 'Brand', 'X')]),
        ).toEqual([]);
    });

    it('groups several values of one facet into a single row', () => {
        expect(
            facetSpecs([
                fv('color', 'Color', 'Red'),
                fv('color', 'Color', 'Blue'),
                fv('side', 'Side', 'Left'),
            ]),
        ).toEqual([
            { label: 'Color', value: 'Red, Blue' },
            { label: 'Side', value: 'Left' },
        ]);
    });
});
