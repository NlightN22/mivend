import { describe, it, expect } from 'vitest';
import { restoreErpDocumentsFilters } from '../../api/erpDocumentsList';
import { conditionsToErpDocumentFilter } from '../../api/erpDocumentsFilter';
import {
    ERP_DOCUMENTS_URL_DEFAULTS,
    fromErpDocumentsUrlState,
    toErpDocumentsUrlState,
} from '../../composables/erpDocumentsListUrl';
import { erpDocumentColumns } from '../../components/erp-documents/erpDocumentsColumns';
import {
    formatErpDocumentAmount,
    toErpDocumentRows,
} from '../../components/erp-documents/erpDocumentsRows';
import enErp from '../../i18n/en/erpDocuments';
import ruErp from '../../i18n/ru/erpDocuments';

function keys(value: unknown, prefix = ''): string[] {
    if (typeof value !== 'object' || value === null) return [prefix];
    return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('ERP documents list URL state', () => {
    it('round-trips filters, sort, preset and page size', () => {
        const conditions = [{ columnKey: 'amount', operator: 'gt' as const, value: '100' }];
        const sort = { field: 'number' as const, dir: 'ASC' as const };
        const preset = { orderId: '7', counterpartyId: '' };
        const url = toErpDocumentsUrlState(
            { search: '9', view: 'all', conditions },
            preset,
            sort,
            20,
        );
        expect(fromErpDocumentsUrlState(url)).toEqual({
            filters: { search: '9', view: 'all', conditions },
            sort,
            preset,
            pageSize: 20,
        });
    });

    it('drops a non-numeric preset id, an unknown sort field and a bad page size', () => {
        const parsed = fromErpDocumentsUrlState({
            ...ERP_DOCUMENTS_URL_DEFAULTS,
            orderId: '1 OR 1=1',
            counterpartyId: '42',
            sortField: 'comment',
            pageSize: 'x',
        });
        expect(parsed.preset).toEqual({ orderId: '', counterpartyId: '42' });
        expect(parsed.sort).toEqual({ field: 'date', dir: 'DESC' });
        expect(parsed.pageSize).toBe(10);
    });

    it('restores a stored view and ignores junk', () => {
        expect(restoreErpDocumentsFilters({ search: 5, conditions: 3 })).toEqual({
            search: '',
            view: 'all',
            conditions: [],
        });
    });
});

describe('ERP documents filter, columns and rows', () => {
    it('maps builder fields to the server filter, amount in minor units', () => {
        expect(
            conditionsToErpDocumentFilter([
                { columnKey: 'amount', operator: 'gt', value: '12.5' },
                { columnKey: 'order', operator: 'eq', value: '1000' },
            ]),
        ).toEqual({ amount: { gt: 1250 }, orderCode: { eq: '1000' } });
        expect(conditionsToErpDocumentFilter([])).toBeUndefined();
    });

    it('keeps the number first and the date second, and drops the contract for order corrections', () => {
        const fields = (kind: Parameters<typeof erpDocumentColumns>[0]): string[] =>
            erpDocumentColumns(kind).map(c => c.field);
        expect(fields('customerClaim').slice(0, 2)).toEqual(['number', 'date']);
        expect(fields('salesCorrection')).toContain('contract');
        expect(fields('orderCorrection')).not.toContain('contract');
    });

    it('shows a currency only when it is an alphabetic code', () => {
        expect(formatErpDocumentAmount(150000, 'rub')).toMatch(/RUB$/);
        expect(formatErpDocumentAmount(150000, '0b7f-guid')).not.toMatch(/guid/);
        expect(formatErpDocumentAmount(150000, null)).not.toMatch(/[A-Z]{3}$/);
    });

    it('maps unresolved links to dashes and counts the products beyond the shown names', () => {
        const [row] = toErpDocumentRows([
            {
                id: '1',
                number: '15',
                date: null,
                counterpartyId: null,
                counterpartyName: null,
                orderId: null,
                orderCode: null,
                organizationName: null,
                contractName: null,
                currency: null,
                amount: 100,
                comment: null,
                lineCount: 5,
                productNames: ['A', 'B'],
            },
        ]);
        expect(row).toMatchObject({
            customer: '—',
            orderCode: '',
            products: 'A, B',
            moreProducts: 3,
        });
    });
});

describe('ERP documents catalogue', () => {
    it('has the same keys in en and ru', () => {
        expect(keys(ruErp).sort()).toEqual(keys(enErp).sort());
    });
});
