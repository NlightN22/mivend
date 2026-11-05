import { describe, expect, it } from 'vitest';
import {
    caretAfterDigits,
    digitsBeforeCaret,
    formatPersonName,
    formatRuPhone,
    isCompleteRuPhone,
    isValidPersonName,
} from '../../utils/contactFormat';

describe('formatRuPhone', () => {
    it.each([
        ['', ''],
        ['9', '+7 (9'],
        ['913', '+7 (913)'],
        ['9131', '+7 (913) 1'],
        ['89131234567', '+7 (913) 123-45-67'],
        ['+7 913 123 45 67', '+7 (913) 123-45-67'],
        ['7913123456799', '+7 (913) 123-45-67'],
    ])('%s -> %s', (raw, out) => expect(formatRuPhone(raw)).toBe(out));

    it('checks completeness', () => {
        expect(isCompleteRuPhone('+7 (913) 123-45-6')).toBe(false);
        expect(isCompleteRuPhone('+7 (913) 123-45-67')).toBe(true);
    });

    it('keeps the caret after the same digit', () => {
        expect(digitsBeforeCaret('+7 (913) 1', 10)).toBe(4);
        expect(caretAfterDigits('+7 (913) 123-45-67', 4)).toBe(10);
        expect(caretAfterDigits('+7 (913) 123-45-67', 1)).toBe(5);
    });
});

describe('person name', () => {
    it('formats while typing', () => {
        expect(formatPersonName('иванов  иван-петрович 1')).toBe('Иванов Иван-Петрович ');
    });
    it('requires at least two words', () => {
        expect(isValidPersonName('Иванов')).toBe(false);
        expect(isValidPersonName('Иванов Иван')).toBe(true);
        expect(isValidPersonName('Иванов И.')).toBe(true);
    });
});
