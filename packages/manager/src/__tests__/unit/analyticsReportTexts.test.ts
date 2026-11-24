// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { localizeReport, type AnalyticsReportInfo } from '../../api/analytics';
import { setLocale } from '../../i18n';
import { buildEntityFilterColumns } from '../../api/orderAnalyticsFilter';
import { buildOrderAnalyticsColumns } from '../../components/analytics/orderAnalyticsColumns';

afterEach(() => setLocale('en'));

const report = (key: string, area = 'sales'): AnalyticsReportInfo => ({
    key,
    title: 'Server title',
    description: 'Server description',
    area,
    status: 'planned',
    note: 'Server note',
});

describe('report catalog texts', () => {
    it('translates the title, description, note and area by report code', async () => {
        await setLocale('ru');
        const ru = localizeReport(report('orders'));
        expect(ru.title).toBe('Заказы');
        expect(ru.area).toBe('Продажи');
        expect(ru.description).not.toBe('Server description');
        expect(ru.note).not.toBe('Server note');

        await setLocale('en');
        expect(localizeReport(report('orders')).title).toBe('Orders');
    });

    it('keeps the server text for a code or area the client has no entry for', async () => {
        await setLocale('ru');
        expect(localizeReport(report('brand-new-report', 'brand-new-area'))).toMatchObject({
            title: 'Server title',
            description: 'Server description',
            note: 'Server note',
            area: 'brand-new-area',
        });
    });

    it('translates every currently registered report code in both languages', async () => {
        const codes = [
            'orders',
            'sales-dynamics',
            'sales-dynamics-by-brand',
            'customer-concentration',
            'order-frequency',
            'churned-customers',
            'churned-customers-by-brand',
            'assortment-churn',
            'new-customers-funnel',
            'receivables-aging',
            'sales-by-manager-at-sale',
            'sales-by-manager-current',
        ];
        for (const locale of ['en', 'ru'] as const) {
            await setLocale(locale);
            for (const code of codes) {
                expect(localizeReport(report(code)).title, `${locale} ${code}`).not.toBe(
                    'Server title',
                );
            }
        }
    });
});

describe('orders report language switch', () => {
    it('rebuilds column headers and filter names in the active language', async () => {
        await setLocale('en');
        const en = [
            ...buildOrderAnalyticsColumns(true, true).map(c => c.header),
            ...buildEntityFilterColumns().map(c => c.label),
        ];
        await setLocale('ru');
        const ru = [
            ...buildOrderAnalyticsColumns(true, true).map(c => c.header),
            ...buildEntityFilterColumns().map(c => c.label),
        ];
        expect(ru).toHaveLength(en.length);
        expect(ru.some((label, i) => label === en[i])).toBe(false);
    });
});
