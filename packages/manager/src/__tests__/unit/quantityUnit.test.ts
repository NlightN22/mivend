import { describe, expect, it } from 'vitest';
import { multipleMessage, notMultiple, quantityUnitHint } from '../../utils/quantityUnit';

describe('quantityUnitHint', () => {
    it('shows nothing without unit data, even with a multiple', () => {
        expect(quantityUnitHint(null, 6)).toBe('');
        expect(quantityUnitHint('  ', 1)).toBe('');
        expect(quantityUnitHint(undefined)).toBe('');
    });

    it('shows the ERP unit alone, or with the pack multiple above one', () => {
        expect(quantityUnitHint('pcs', 1)).toBe('pcs');
        expect(quantityUnitHint('pack', 6)).toBe('pack (x6)');
    });
});

describe('multiple helpers', () => {
    it('detects a quantity off the multiple and names it like the add refusal', () => {
        expect(notMultiple(7, 6)).toBe(true);
        expect(notMultiple(12, 6)).toBe(false);
        expect(notMultiple(7, 1)).toBe(false);
        expect(multipleMessage('AB-1', 6)).toBe('AB-1 must be ordered in multiples of 6');
    });
});
