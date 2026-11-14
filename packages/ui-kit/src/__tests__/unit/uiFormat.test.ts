// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { mount } from '@vue/test-utils';
import { currencySymbol } from '../../utils/uiFormat';
import { UI_LOCALE_KEY } from '../../utils/uiLocale';
import { describeValue } from '../../components/MvColumnFilter/columnFilterDispatch';
import MvAmountDisplay from '../../components/MvAmountDisplay/MvAmountDisplay.vue';

const range = { mode: 'more' as const, min: 5 };

describe('ui locale formatting', () => {
    it('keeps the historical output without a provider', () => {
        expect(currencySymbol('USD', 'en-US')).toBe('$');
        expect(describeValue({ type: 'amount-range', currencyCode: 'USD' }, range)).toBe('≥ $5');
        const expected = new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(1234);
        expect(mount(MvAmountDisplay, { props: { amount: 1234 } }).text()).toBe(expected);
    });

    it('follows the injected locale', () => {
        const global = { provide: { [UI_LOCALE_KEY as symbol]: ref('en-GB') } };
        const text = mount(MvAmountDisplay, {
            props: { amount: 1234.5, decimals: 2, currency: 'GBP' },
            global,
        }).text();
        expect(text).toBe('£1,234.50');
        expect(describeValue({ type: 'amount-range', currencyCode: 'RUB' }, range, 'ru-RU')).toBe(
            '≥ ₽5',
        );
    });
});
