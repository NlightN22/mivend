import { describe, expect, it } from 'vitest';

import { resolveVatCode } from '../../vat-code-resolver';

const DEFAULT_ID = 'tax-default';

describe('resolveVatCode', () => {
    it('resolves a recognized code to its matching TaxCategory, no flag', () => {
        const map = new Map([['NDS20', 'tax-20']]);

        const result = resolveVatCode('НДС20', map, DEFAULT_ID);

        expect(result).toEqual({ kind: 'resolved', taxCategoryId: 'tax-20' });
    });

    it('returns auto-create for a recognized code with no matching TaxCategory yet', () => {
        const map = new Map<string, string>();

        const result = resolveVatCode('НДС20', map, DEFAULT_ID);

        expect(result).toEqual({ kind: 'auto-create', erpVatCode: 'NDS20', rawCode: 'НДС20' });
    });

    it('falls back to default with a legacy flag for НДС18', () => {
        const map = new Map([['NDS20', 'tax-20']]);

        const result = resolveVatCode('НДС18', map, DEFAULT_ID);

        expect(result).toMatchObject({ kind: 'resolved', taxCategoryId: DEFAULT_ID });
        expect((result as { flag?: { reason: string } }).flag).toEqual(
            expect.objectContaining({ reason: 'legacy' }),
        );
    });

    it('falls back to default with an unset flag for an empty code', () => {
        const map = new Map([['NDS20', 'tax-20']]);

        const result = resolveVatCode('', map, DEFAULT_ID);

        expect(result).toMatchObject({ kind: 'resolved', taxCategoryId: DEFAULT_ID });
        expect((result as { flag?: { reason: string } }).flag).toEqual(
            expect.objectContaining({ reason: 'unset' }),
        );
    });

    it('returns auto-create keyed by the raw code itself for a never-seen-before code', () => {
        const map = new Map([['NDS20', 'tax-20']]);

        const result = resolveVatCode('НДС18_118', map, DEFAULT_ID);

        expect(result).toEqual({
            kind: 'auto-create',
            erpVatCode: 'НДС18_118',
            rawCode: 'НДС18_118',
        });
    });
});
