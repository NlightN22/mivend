import { describe, expect, it } from 'vitest';
import enElement from 'element-plus/es/locale/lang/en';
import ruElement from 'element-plus/es/locale/lang/ru';
import { elementLocale } from '../../i18n/elementLocale';
import { formatMoney, moneyTag } from '../../i18n/format';

describe('elementLocale', () => {
    it('picks the Element Plus pack of the interface locale', () => {
        expect(elementLocale('ru')).toBe(ruElement);
        expect(elementLocale('en')).toBe(enElement);
    });

    it('falls back to English for an unknown locale', () => {
        expect(elementLocale('de')).toBe(enElement);
    });
});

describe('formatMoney', () => {
    it('keeps the en-US style in English', () => {
        expect(moneyTag('en')).toBe('en-US');
        const text = formatMoney(123000, 'RUB', {}, moneyTag('en')).replace(/\s/g, ' ');
        expect(text).toBe('RUB 1,230.00');
    });

    it('uses the ru-RU style in Russian', () => {
        const text = formatMoney(123000, 'RUB', {}, moneyTag('ru')).replace(/\s/g, ' ');
        expect(text).toBe('1 230,00 ₽');
    });
});
