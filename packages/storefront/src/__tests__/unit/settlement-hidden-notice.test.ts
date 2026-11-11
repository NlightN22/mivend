import { afterAll, describe, expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import en from '../../i18n/en';
import ru from '../../i18n/ru';
import { i18n } from '../../i18n';
import SettlementHiddenNotice from '../../pages/settlements/SettlementHiddenNotice.vue';

const render = async (
    summary: { currency: string; count: number; netAmount: number }[],
): Promise<string> => renderToString(createSSRApp(SettlementHiddenNotice, { summary }).use(i18n));

describe('SettlementHiddenNotice', () => {
    afterAll(() => {
        i18n.global.locale.value = 'en';
    });

    it('renders nothing when no document is hidden', async () => {
        i18n.global.setLocaleMessage('en', en);
        expect(await render([])).toBe('<!---->');
        expect(await render([{ currency: 'RUB', count: 0, netAmount: 0 }])).toBe('<!---->');
    });

    it('shows the count and the net amount per currency without naming the documents', async () => {
        i18n.global.setLocaleMessage('en', en);
        i18n.global.locale.value = 'en';
        const text = await render([
            { currency: 'RUB', count: 1, netAmount: 12345 },
            { currency: 'USD', count: 3, netAmount: -500 },
        ]);
        expect(text).toContain('1 document is not shown');
        expect(text).toContain('3 documents are not shown');
        expect(text).toContain('123.45');
        expect(text).not.toMatch(/payroll|supplier/i);
    });

    it('uses the Russian plural forms', async () => {
        i18n.global.setLocaleMessage('ru', ru);
        i18n.global.locale.value = 'ru';
        const text = await render([{ currency: 'RUB', count: 5, netAmount: 100 }]);
        expect(text).toContain('5 документов не показано');
        expect(text).not.toMatch(/зарплат|поставщик/i);
    });
});
