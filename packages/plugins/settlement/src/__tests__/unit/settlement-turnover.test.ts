import { describe, expect, it } from 'vitest';

import { SALES_CORRECTION_DOCUMENT_TYPE, movesTurnoverByDefault } from '../../settlement-turnover';

describe('movesTurnoverByDefault', () => {
    it('is true for sales, returns and the sales correction', () => {
        expect(movesTurnoverByDefault('AnySale', 'sale')).toBe(true);
        expect(movesTurnoverByDefault('AnyReturn', 'return')).toBe(true);
        expect(movesTurnoverByDefault(SALES_CORRECTION_DOCUMENT_TYPE, 'correction')).toBe(true);
    });

    it('is false for payments, suppliers and other corrections', () => {
        expect(movesTurnoverByDefault('Pay', 'payment')).toBe(false);
        expect(movesTurnoverByDefault('Supply', 'supplier')).toBe(false);
        expect(movesTurnoverByDefault('DebtFix', 'correction')).toBe(false);
    });
});
