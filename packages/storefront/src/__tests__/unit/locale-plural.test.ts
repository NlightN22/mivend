import { afterAll, describe, expect, it } from 'vitest';
import { i18n } from '../../i18n';
import { formatAmount } from '../../i18n/format';
import ru from '../../i18n/ru';

const nbsp = (s: string): string => s.replace(/[\u00a0\u202f]/g, ' ');

describe('catalogue plurals and amount formatter', () => {
    afterAll(() => {
        i18n.global.locale.value = 'en';
    });

    it('picks the English singular and plural forms', () => {
        expect(i18n.global.t('cart.items', 1)).toBe('1 item');
        expect(i18n.global.t('cart.items', 5)).toBe('5 items');
    });

    it('picks the three Russian forms, including the 11-14 exception', () => {
        i18n.global.setLocaleMessage('ru', ru);
        i18n.global.locale.value = 'ru';
        const forms = [1, 2, 5, 11, 21, 22, 112].map(n => i18n.global.t('cart.items', n));
        expect(forms).toEqual([
            '1 позиция',
            '2 позиции',
            '5 позиций',
            '11 позиций',
            '21 позиция',
            '22 позиции',
            '112 позиций',
        ]);
        expect(nbsp(formatAmount(1080.5, 'RUB'))).toBe('1 080,50 ₽');
    });

    it('formats ui-kit amounts with the active locale and two decimals whatever the caller asks', () => {
        i18n.global.locale.value = 'en';
        expect(formatAmount(1080.5, 'RUB')).toBe('₽1,080.50');
        expect(formatAmount(1080, 'RUB')).toBe('₽1,080.00');
    });
});
