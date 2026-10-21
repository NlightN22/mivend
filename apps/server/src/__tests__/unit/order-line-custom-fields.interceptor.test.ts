import { describe, expect, it } from 'vitest';

import { findCustomFieldKeys } from '../../order-line-custom-fields.interceptor';

describe('findCustomFieldKeys (#266)', () => {
    it('finds custom fields on addItemToDraftOrder / adjustDraftOrderLine inputs', () => {
        expect(
            findCustomFieldKeys({ input: { quantity: 1, customFields: { manualUnitPrice: 1 } } }),
        ).toEqual(['manualUnitPrice']);
    });

    it('finds custom fields nested in modifyOrder item lists', () => {
        const args = {
            input: {
                addItems: [{ quantity: 1, customFields: { manualPriceReason: 'x' } }],
                adjustOrderLines: [{ quantity: 2, customFields: { manualUnitPrice: 5 } }],
            },
        };
        expect(findCustomFieldKeys(args).sort()).toEqual(['manualPriceReason', 'manualUnitPrice']);
    });

    it('ignores inputs without custom fields and explicit undefined values', () => {
        expect(findCustomFieldKeys({ input: { quantity: 1 } })).toEqual([]);
        expect(findCustomFieldKeys({ input: { customFields: { a: undefined } } })).toEqual([]);
    });
});
