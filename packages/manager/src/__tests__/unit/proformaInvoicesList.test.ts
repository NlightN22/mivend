import { describe, it, expect } from 'vitest';
import { restoreProformaInvoicesFilters } from '../../api/proformaInvoicesList';
import {
    PROFORMA_INVOICES_URL_DEFAULTS,
    fromProformaInvoicesUrlState,
    toProformaInvoicesUrlState,
} from '../../composables/proformaInvoicesListUrl';
import { conditionsToProformaInvoicesFilter } from '../../api/proformaInvoicesFilter';
import { toProformaInvoiceRows } from '../../components/proforma-invoices/proformaInvoicesRows';
import type { ProformaInvoiceListItem } from '../../api/proforma-invoices';

describe('proforma invoices list URL state', () => {
    it('round-trips search, view, customer and page size', () => {
        const conditions = [{ columnKey: 'amount', operator: 'gt' as const, value: '100' }];
        const sort = { field: 'amount' as const, dir: 'ASC' as const };
        const url = toProformaInvoicesUrlState(
            { search: '1000', view: 'current', conditions },
            'cp-1',
            sort,
            20,
        );
        expect(fromProformaInvoicesUrlState(url)).toEqual({
            filters: { search: '1000', view: 'current', conditions },
            sort,
            counterpartyId: 'cp-1',
            pageSize: 20,
        });
    });

    it('falls back to defaults for an unknown view or page size', () => {
        const parsed = fromProformaInvoicesUrlState({
            ...PROFORMA_INVOICES_URL_DEFAULTS,
            view: 'paid',
            pageSize: 'x',
        });
        expect(parsed.filters.view).toBe('all');
        expect(parsed.pageSize).toBe(10);
        expect(parsed.sort).toEqual({ field: 'createdAt', dir: 'DESC' });
        expect(
            fromProformaInvoicesUrlState({
                ...PROFORMA_INVOICES_URL_DEFAULTS,
                sortField: 'orderCode',
            }).sort.field,
        ).toBe('createdAt');
    });

    it('restores a stored view and ignores junk', () => {
        expect(restoreProformaInvoicesFilters({ search: 'a', view: 'cancelled' })).toEqual({
            search: 'a',
            view: 'cancelled',
            conditions: [],
        });
        expect(restoreProformaInvoicesFilters(null)).toEqual({
            search: '',
            view: 'all',
            conditions: [],
        });
        expect(restoreProformaInvoicesFilters({ search: 5, view: 'x', conditions: 3 })).toEqual({
            search: '',
            view: 'all',
            conditions: [],
        });
    });
});

describe('conditionsToProformaInvoicesFilter', () => {
    it('maps builder fields to the server filter, amount in minor units', () => {
        expect(
            conditionsToProformaInvoicesFilter([
                { columnKey: 'amount', operator: 'gt', value: '12.5' },
                { columnKey: 'order', operator: 'eq', value: '1000' },
                { columnKey: 'customer', operator: 'contains', value: 'Alpha' },
            ]),
        ).toEqual({
            amount: { gt: 1250 },
            orderCode: { eq: '1000' },
            customer: { contains: 'Alpha' },
        });
    });

    it('is undefined without conditions', () => {
        expect(conditionsToProformaInvoicesFilter([])).toBeUndefined();
    });
});

describe('toProformaInvoiceRows', () => {
    const item = {
        id: '1',
        number: '1000-01',
        version: 2,
        createdAt: '2026-01-02T10:00:00.000Z',
        counterpartyShortName: null,
        amount: 12345,
        currencyCode: 'RUB',
        displayStatus: 'superseded',
        dueDate: '2026-01-09T10:00:00.000Z',
        order: null,
    } as unknown as ProformaInvoiceListItem;

    it('maps status, money and missing customer and order', () => {
        const [row] = toProformaInvoiceRows([item]);
        expect(row.status).toBe('Superseded');
        expect(row.statusVariant).toBe('neutral');
        expect(row.customer).toBe('—');
        expect(row.orderCode).toBe('');
        expect(row.amount).toContain('123.45');
    });
});
