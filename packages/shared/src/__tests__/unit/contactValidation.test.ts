import { describe, expect, it } from 'vitest';
import { normalizePhone, validateTradingPointContact } from '../../contactValidation';

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
    it('skips fields the caller marks unchanged', () => {
        const input = { ...valid, address: 'Somewhere', contactPhone: '123' };
        expect(validateTradingPointContact(input)).not.toBeNull();
        expect(validateTradingPointContact(input, ['address', 'contactPhone'])).toBeNull();
    });
    it.each([
        ['8 (495) 123-45-67', '+7 495 123 45 67'],
        ['+7 (913) 123-45-67', '+7 913 123 45 67'],
        ['+90-532-123-45-67', '+90 532 123 45 67'],
        ['+380 44 123 4567', '+380 44 123 4567'],
        ['+7 495 123 45 67 ext 12', '+7 495 123 45 67 ext. 12'],
    ])('normalizes %s to one stored format', (raw, stored) => {
        expect(normalizePhone(raw)).toBe(stored);
    });
    it.each(['+7 495 12', '8 (495) 123-45', '+99 1', 'abc'])('rejects %s', raw =>
        expect(normalizePhone(raw)).toBeNull(),
    );
    it('normalizes phones to one format', () => {
        expect(normalizePhone('89131234567')).toBe('+7 913 123 45 67');
        expect(normalizePhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
        expect(normalizePhone('123')).toBeNull();
    });
});
