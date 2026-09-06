import { describe, expect, it } from 'vitest';

import { resolveVatCode } from '../../vat-code-resolver';

const DEFAULT_ID = 'tax-default';

describe('resolveVatCode', () => {
    it('resolves a recognized code to its matching TaxCategory, no flag', () => {
        const map = new Map([['NDS20', 'tax-20']]);

        const result = resolveVatCode('НДС20', map, DEFAULT_ID);

        expect(result).toEqual({ taxCategoryId: 'tax-20' });
    });

    it('falls back to default with a category-not-configured flag when recognized but no matching category exists', () => {
        const map = new Map<string, string>();

        const result = resolveVatCode('НДС20', map, DEFAULT_ID);

        expect(result.taxCategoryId).toBe(DEFAULT_ID);
        expect(result.flag).toEqual(expect.objectContaining({ reason: 'category-not-configured' }));
    });

    it('falls back to default with a legacy flag for НДС18', () => {
        const map = new Map([['NDS20', 'tax-20']]);

        const result = resolveVatCode('НДС18', map, DEFAULT_ID);

        expect(result.taxCategoryId).toBe(DEFAULT_ID);
        expect(result.flag).toEqual(expect.objectContaining({ reason: 'legacy' }));
    });

    it('falls back to default with an unset flag for an empty code', () => {
        const map = new Map([['NDS20', 'tax-20']]);

        const result = resolveVatCode('', map, DEFAULT_ID);

        expect(result.taxCategoryId).toBe(DEFAULT_ID);
        expect(result.flag).toEqual(expect.objectContaining({ reason: 'unset' }));
    });

    it('falls back to default with an unrecognized flag for any other value', () => {
        const map = new Map([['NDS20', 'tax-20']]);

        const result = resolveVatCode('НДС18_118', map, DEFAULT_ID);

        expect(result.taxCategoryId).toBe(DEFAULT_ID);
        expect(result.flag).toEqual(
            expect.objectContaining({
                reason: 'unrecognized',
                detail: expect.stringContaining('НДС18_118'),
            }),
        );
    });
});
