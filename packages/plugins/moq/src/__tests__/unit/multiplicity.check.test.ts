import { describe, expect, it } from 'vitest';

import { evaluateMultiplicity } from '../../multiplicity.check';

const line = (over: Partial<Parameters<typeof evaluateMultiplicity>[0][number]> = {}) => ({
    lineId: 'l1',
    productVariantId: 'v1',
    sku: 'SKU-1',
    quantity: 5,
    requiredMultiple: 4,
    ...over,
});

describe('evaluateMultiplicity', () => {
    it('flags a quantity that is not a multiple, with the facts to explain it', () => {
        expect(evaluateMultiplicity([line()])).toEqual([
            {
                severity: 'warning',
                lineRef: 'l1',
                messageKey: 'order.multiplicity.violated',
                facts: { sku: 'SKU-1', quantity: 5, requiredMultiple: 4 },
            },
        ]);
    });

    it('passes a multiple and never flags an absent rule (multiple 1)', () => {
        expect(evaluateMultiplicity([line({ quantity: 8 })])).toEqual([]);
        expect(evaluateMultiplicity([line({ requiredMultiple: 1, quantity: 7 })])).toEqual([]);
    });
});
