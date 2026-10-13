import { describe, it, expect } from 'vitest';
import { dateInWords, formatMoneyRu, pluralForm, rublesInWords } from '../../pdf/russian-words';

describe('rublesInWords', () => {
    it.each([
        [483370, 'Четыре тысячи восемьсот тридцать три рубля 70 копеек'],
        [0, 'Ноль рублей 00 копеек'],
        [100, 'Один рубль 00 копеек'],
        [101, 'Один рубль 01 копейка'],
        [200, 'Два рубля 00 копеек'],
        [1100, 'Одиннадцать рублей 00 копеек'],
        [200002, 'Две тысячи рублей 02 копейки'],
        [2100000, 'Двадцать одна тысяча рублей 00 копеек'],
        [100000000, 'Один миллион рублей 00 копеек'],
        [100100100, 'Один миллион одна тысяча один рубль 00 копеек'],
        [5, 'Ноль рублей 05 копеек'],
        [1200000, 'Двенадцать тысяч рублей 00 копеек'],
        [100000000000, 'Один миллиард рублей 00 копеек'],
    ])('%i -> %s', (minor, words) => {
        expect(rublesInWords(minor)).toBe(words);
    });
});

describe('pluralForm', () => {
    it('handles 1, 2-4, 5-20 and 11-14 edge cases', () => {
        const f: [string, string, string] = ['a', 'b', 'c'];
        expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map(n => pluralForm(n, f))).toEqual([
            'a',
            'b',
            'c',
            'c',
            'c',
            'a',
            'b',
            'c',
            'c',
        ]);
    });
});

describe('dateInWords', () => {
    it('writes the month in the genitive case', () => {
        expect(dateInWords(new Date('2026-10-12T10:00:00Z'))).toBe('12 октября 2026 г.');
        expect(dateInWords(new Date('2026-03-01T10:00:00Z'))).toBe('1 марта 2026 г.');
    });
});

describe('formatMoneyRu', () => {
    it('groups thousands with a non-breaking space and uses a decimal comma', () => {
        expect(formatMoneyRu(125187)).toBe('1 251,87');
        expect(formatMoneyRu(5)).toBe('0,05');
        expect(formatMoneyRu(-1500)).toBe('-15,00');
    });
});
