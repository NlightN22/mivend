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

    // #144: a fresh contour may have no default TaxCategory yet.
    it('resolves an exact code without needing a default TaxCategory', () => {
        const map = new Map([['NDS20', 'tax-20']]);

        expect(resolveVatCode('НДС20', map, undefined)).toEqual({
            kind: 'resolved',
            taxCategoryId: 'tax-20',
        });
    });

    it('reports missing-default for unset/legacy codes when no default TaxCategory exists', () => {
        const map = new Map([['NDS20', 'tax-20']]);

        expect(resolveVatCode('', map, undefined)).toEqual({
            kind: 'missing-default',
            reason: 'unset',
        });
        expect(resolveVatCode('НДС18', map, undefined)).toEqual({
            kind: 'missing-default',
            reason: 'legacy',
        });
    });
});
