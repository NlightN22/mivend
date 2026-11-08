import { describe, it, expect } from 'vitest';
import { restorePaymentsFilters } from '../../api/paymentsList';
import {
    PAYMENTS_URL_DEFAULTS,
    fromPaymentsUrlState,
    toPaymentsUrlState,
} from '../../composables/paymentsListUrl';
import { conditionsToPaymentsFilter } from '../../api/paymentsFilter';
import { toPaymentRows } from '../../components/payments/paymentsRows';
import type { PaymentListItem } from '../../api/payments';

describe('payments list URL state', () => {
    it('round-trips search, view, customer and page size', () => {
        const conditions = [{ columnKey: 'amount', operator: 'gt' as const, value: '100' }];
        const sort = { field: 'amount' as const, dir: 'ASC' as const };
        const url = toPaymentsUrlState(
            { search: '1000', view: 'captured', conditions },
            'cp-1',
            sort,
            20,
        );
        expect(fromPaymentsUrlState(url)).toEqual({
            filters: { search: '1000', view: 'captured', conditions },
            sort,
            counterpartyId: 'cp-1',
            pageSize: 20,
        });
    });

    it('falls back to defaults for an unknown view, sort field or page size', () => {
        const parsed = fromPaymentsUrlState({
            ...PAYMENTS_URL_DEFAULTS,
            view: 'paid',
            pageSize: 'x',
            sortField: 'orderCode',
        });
        expect(parsed.filters.view).toBe('all');
        expect(parsed.pageSize).toBe(10);
        expect(parsed.sort).toEqual({ field: 'createdAt', dir: 'DESC' });
    });

    it('restores a stored view and ignores junk', () => {
        expect(restorePaymentsFilters({ search: 'a', view: 'failed' })).toEqual({
            search: 'a',
            view: 'failed',
            conditions: [],
        });
        expect(restorePaymentsFilters({ search: 5, view: 'x', conditions: 3 })).toEqual({
            search: '',
            view: 'all',
            conditions: [],
        });
    });
});

describe('conditionsToPaymentsFilter', () => {
    it('maps builder fields to the server filter, amount in minor units', () => {
        expect(
            conditionsToPaymentsFilter([
                { columnKey: 'amount', operator: 'gt', value: '12.5' },
                { columnKey: 'order', operator: 'eq', value: '1000' },
                { columnKey: 'proformaInvoice', operator: 'contains', value: '1000-01' },
                { columnKey: 'channel', operator: 'eq', value: 'branch-kassa' },
            ]),
        ).toEqual({
            amount: { gt: 1250 },
            orderCode: { eq: '1000' },
            proformaInvoiceNumber: { contains: '1000-01' },
            channel: { eq: 'branch-kassa' },
        });
    });

    it('is undefined without conditions', () => {
        expect(conditionsToPaymentsFilter([])).toBeUndefined();
    });
});

describe('toPaymentRows', () => {
    const item = {
        id: '1',
        number: '1000000001',
        createdAt: '2026-01-02T10:00:00.000Z',
        channel: 'bank-transfer-erp',
        paymentStatus: 'refunded',
        amount: 12345,
        currencyCode: 'RUB',
        counterpartyId: null,
        counterpartyShortName: null,
        proformaInvoiceNumber: null,
        orderCode: null,
    } as unknown as PaymentListItem;

    it('maps labels, money and missing customer, proforma invoice and order', () => {
        const [row] = toPaymentRows([item]);
        expect(row.status).toBe('Refunded');
        expect(row.statusVariant).toBe('neutral');
        expect(row.channel).toBe('Bank transfer (ERP)');
        expect(row.customer).toBe('\u2014');
        expect(row.proformaInvoice).toBe('');
        expect(row.orderCode).toBe('');
        expect(row.amount).toContain('123.45');
    });
});
