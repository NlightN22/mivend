import { describe, expect, it, vi } from 'vitest';

import { codeProductMappings } from '../../code-index-fields';

describe('code index mappings', () => {
    it('normalizes every variant sku of the product', () => {
        const value = codeProductMappings.skusNormalized.valueFn(null, [
            { sku: '48.3855' },
            { sku: 'AB-1' },
        ] as never);
        expect(value).toEqual(['483855', 'ab1']);
    });

    it('normalizes the part number and indexes nothing when absent', () => {
        const fn = codeProductMappings.partNumberNormalized.valueFn;
        expect(fn({ customFields: { manufacturerPartNumber: 'XY 12-3' } })).toEqual(['xy123']);
        expect(fn({ customFields: { manufacturerPartNumber: null } })).toEqual([]);
    });

    it('normalizes cross-reference codes', async () => {
        const findByProductId = vi.fn().mockResolvedValue([{ oemCode: '15400-RTA-003' }]);
        const injector = { get: () => ({ findByProductId }) };
        const value = await codeProductMappings.oemCodesNormalized.valueFn(
            { id: 7 },
            [],
            'en',
            injector as never,
            {} as never,
        );
        expect(value).toEqual(['15400rta003']);
        expect(findByProductId).toHaveBeenCalledWith({}, 7);
    });
});
