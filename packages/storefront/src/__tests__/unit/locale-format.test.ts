import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney, formatNumber } from '../../i18n/format';

const nbsp = (s: string): string => s.replace(/[\u00a0\u202f]/g, ' ');
const DATE = '2026-03-05T10:00:00Z';

describe('locale-aware formatter', () => {
    it('groups numbers per locale', () => {
        expect(formatNumber(1234567.5, {}, 'en-GB')).toBe('1,234,567.5');
        expect(nbsp(formatNumber(1234567.5, {}, 'ru'))).toBe('1 234 567,5');
    });

    it('formats money with the narrow currency symbol and no forced fraction', () => {
        expect(formatMoney(1080, 'RUB', undefined, 'en-GB')).toBe('₽1,080');
        expect(nbsp(formatMoney(1080, 'RUB', undefined, 'ru'))).toBe('1 080 ₽');
        expect(formatMoney(10.5, 'RUB', { maximumFractionDigits: 2 }, 'en-GB')).toBe('₽10.5');
    });

    it('formats a plain number when the currency is unknown', () =>
        expect(formatMoney(1080, null, undefined, 'en-GB')).toBe('1,080'));

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
