import { describe, expect, it } from 'vitest';
import { normalizeRuPhone, validateTradingPointContact } from '../../contactValidation';

const valid = { name: 'Point', address: 'Street 1, building 5' };

describe('validateTradingPointContact', () => {
    it('accepts a minimal valid point', () =>
        expect(validateTradingPointContact(valid)).toBeNull());
    it('rejects an address without a house number', () =>
        expect(validateTradingPointContact({ ...valid, address: 'Some street' })).not.toBeNull());
    it('rejects an incomplete phone and a one-word name', () => {
        expect(validateTradingPointContact({ ...valid, contactPhone: '+7 913' })).not.toBeNull();
        expect(validateTradingPointContact({ ...valid, contactName: 'Ivanov' })).not.toBeNull();
    });
    it('normalizes phones to one format', () => {
        expect(normalizeRuPhone('89131234567')).toBe('+7 (913) 123-45-67');
        expect(normalizeRuPhone('123')).toBeNull();
    });
});
