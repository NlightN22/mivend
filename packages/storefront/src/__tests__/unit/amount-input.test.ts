import { describe, expect, it } from 'vitest';

import {
    formatAmountInput,
    MAX_AMOUNT_MINOR,
    parseAmountInput,
} from '../../pages/account/amountInput';

const nbsp = (s: string): string => s.replace(/[\u00a0\u202f]/g, ' ');

describe('formatAmountInput', () => {
    it('formats kopecks with the locale separators and two decimals', () => {
        expect(nbsp(formatAmountInput(6000000, 'ru'))).toBe('60 000,00');
        expect(formatAmountInput(6000000, 'en-GB')).toBe('60,000.00');
        expect(formatAmountInput(5, 'en-GB')).toBe('0.05');
    });
});

describe('parseAmountInput', () => {
    it('round-trips its own formatted output in both locales', () => {
        expect(parseAmountInput(formatAmountInput(6000050, 'ru'), 'ru')).toEqual({
            kind: 'ok',
            minor: 6000050,
        });
        expect(parseAmountInput(formatAmountInput(6000050, 'en-GB'), 'en-GB')).toEqual({
            kind: 'ok',
            minor: 6000050,
        });
    });

    it('accepts typed variants: plain digits, spaces, either decimal mark', () => {
        expect(parseAmountInput('60 000,5', 'ru')).toEqual({ kind: 'ok', minor: 6000050 });
        expect(parseAmountInput('60000.5', 'ru')).toEqual({ kind: 'ok', minor: 6000050 });
        expect(parseAmountInput('60000', 'en-GB')).toEqual({ kind: 'ok', minor: 6000000 });
        expect(parseAmountInput('60000,50', 'en-GB')).toEqual({ kind: 'ok', minor: 6000050 });
    });

    it('treats a grouping comma in en as grouping, not as decimals', () => {
        expect(parseAmountInput('1,000', 'en-GB')).toEqual({ kind: 'ok', minor: 100000 });
    });

    it('rejects empty, zero, malformed and over-precise input', () => {
        expect(parseAmountInput('  ', 'ru')).toEqual({ kind: 'empty' });
        for (const text of ['0', '0,00', 'abc', '-5', '1,2,3', '10,555']) {
            expect(parseAmountInput(text, 'ru').kind, text).toBe('invalid');
        }
    });

    it('flags amounts above the GraphQL Int limit and accepts the limit itself', () => {
        expect(parseAmountInput('21 474 836,47', 'ru')).toEqual({
            kind: 'ok',
            minor: MAX_AMOUNT_MINOR,
        });
        expect(parseAmountInput('21 474 836,48', 'ru')).toEqual({ kind: 'tooLarge' });
        expect(parseAmountInput('100000000', 'en-GB')).toEqual({ kind: 'tooLarge' });
    });
});
