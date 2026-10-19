import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney, formatNumber } from '../../i18n/format';

const nbsp = (s: string): string => s.replace(/[\u00a0\u202f]/g, ' ');
const DATE = '2026-03-05T10:00:00Z';

describe('locale-aware formatter', () => {
    it('groups numbers per locale', () => {
        expect(formatNumber(1234567.5, {}, 'en-GB')).toBe('1,234,567.5');
        expect(nbsp(formatNumber(1234567.5, {}, 'ru'))).toBe('1 234 567,5');
    });

    it('formats money with the narrow currency symbol and always two fraction digits', () => {
        expect(formatMoney(1080, 'RUB', 'en-GB')).toBe('₽1,080.00');
        expect(nbsp(formatMoney(1080, 'RUB', 'ru'))).toBe('1 080,00 ₽');
        expect(nbsp(formatMoney(2309.2, 'RUB', 'ru'))).toBe('2 309,20 ₽');
        expect(formatMoney(10.456, 'RUB', 'en-GB')).toBe('₽10.46');
    });

    it('formats a plain number when the currency is unknown', () =>
        expect(formatMoney(1080, null, 'en-GB')).toBe('1,080.00'));

    it('formats dates per locale', () => {
        const opts: Intl.DateTimeFormatOptions = { timeZone: 'UTC' };
        expect(
            formatDate(DATE, { ...opts, day: 'numeric', month: 'long', year: 'numeric' }, 'en-GB'),
        ).toBe('5 March 2026');
        expect(
            formatDate(DATE, { ...opts, day: 'numeric', month: 'long', year: 'numeric' }, 'ru'),
        ).toBe('5 марта 2026 г.');
    });

    it('uses the active locale by default (English)', () =>
        expect(formatNumber(1000)).toBe('1,000'));
});
