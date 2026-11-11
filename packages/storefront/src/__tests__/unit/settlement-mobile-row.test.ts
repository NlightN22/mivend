import { describe, expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import en from '../../i18n/en';
import { i18n } from '../../i18n';
import SettlementTable from '../../pages/settlements/SettlementTable.vue';
import type { SettlementRow } from '../../pages/settlements/useSettlementDocuments';

const row = (over: Partial<SettlementRow>): SettlementRow =>
    ({
        id: '1',
        number: '100500',
        documentType: 'sales_invoice',
        documentTypeLabel: null,
        category: null,
        amount: -12345,
        currency: 'RUB',
        date: '2026-01-02T00:00:00Z',
        dueDate: null,
        contractName: 'Contract-X',
        organizationName: 'Org-Y',
        orders: [],
        paymentStatus: null,
        ...over,
    }) as unknown as SettlementRow;

const render = (rows: SettlementRow[]): Promise<string> =>
    renderToString(createSSRApp(SettlementTable, { rows }).use(i18n));

describe('SettlementTable mobile list', () => {
    it('renders a compact item per document with number, amount and sign', async () => {
        i18n.global.setLocaleMessage('en', en);
        i18n.global.locale.value = 'en';
        const html = await render([row({}), row({ id: '2', number: '777', amount: 500 })]);
        const list = html.slice(html.indexOf('<ul'), html.indexOf('</ul>'));
        expect(list.match(/<li/g)).toHaveLength(2);
        expect(list).toContain('100500');
        expect(list).toContain('−');
        expect(list).toContain('+');
        expect(list).toContain('123,45');
        expect(list).not.toContain('Contract-X');
        expect(html).toContain('<table');
    });

    it('shows due date and order only when present', async () => {
        i18n.global.setLocaleMessage('en', en);
        const plain = await render([row({})]);
        expect(plain).not.toContain('class="secondary"');
        const html = await render([
            row({ dueDate: '2026-02-03T00:00:00Z', orders: [{ orderCode: '555' }] as never }),
        ]);
        expect(html).toContain('class="secondary"');
        expect(html).toContain('555');
    });
});
