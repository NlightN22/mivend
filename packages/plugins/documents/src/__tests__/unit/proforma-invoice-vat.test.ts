import { describe, expect, it } from 'vitest';

import {
    applyPrintTimeVat,
    summarizeVat,
    unconfirmedVatError,
} from '../../pdf/proforma-invoice-vat';

const line = (over: Record<string, unknown>): never =>
    ({
        linePriceWithTax: 12000,
        discounts: [],
        taxRate: null,
        taxCategoryName: 'VAT20',
        ...over,
    }) as never;

describe('print-time VAT', () => {
    it('fills VAT from the now-confirmed category rate and keeps the stored fields untouched', () => {
        const stored = line({});
        const [printed] = applyPrintTimeVat([stored], new Map([['VAT20', 20]]));
        expect(printed).toMatchObject({ taxRate: 20, taxAmount: 2000 });
        expect(stored).toMatchObject({ taxRate: null });
    });

    it('leaves a line unconfirmed when the category rate is still unknown, so generation fails', () => {
        const lines = applyPrintTimeVat([line({})], new Map());
        expect(() => summarizeVat(lines)).toThrow(unconfirmedVatError('VAT20'));
    });

    it('never touches a legacy snapshot without tax data', () => {
        const legacy = line({ taxRate: undefined });
        expect(applyPrintTimeVat([legacy], new Map([['VAT20', 20]]))[0]).toBe(legacy);
    });
});

describe('summarizeVat zero-rate wording', () => {
    it.each([
        ['НДС0', 'zero'],
        ['НДС 0', 'zero'],
        ['БезНДС', 'none'],
        ['Без НДС', 'none'],
    ])('category %s prints as %s', (name, kind) => {
        expect(summarizeVat([{ taxRate: 0, taxCategoryName: name, taxAmount: 0 }]).kind).toBe(kind);
    });
});
