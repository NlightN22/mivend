import { describe, it, expect } from 'vitest';
import { restoreSettlementsFilters } from '../../api/settlementsList';
import { documentTypeVariant } from '../../utils/documentTypeVariant';
import { conditionsToSettlementsFilter } from '../../api/settlementsFilter';
import {
    SETTLEMENTS_URL_DEFAULTS,
    fromSettlementsUrlState,
    toSettlementsUrlState,
} from '../../composables/settlementsListUrl';
import {
    formatSettlementAmount,
    toSettlementRows,
} from '../../components/settlements/settlementsRows';
import type { SettlementListItem } from '../../api/settlements';

describe('settlements list URL state', () => {
    it('round-trips search, type, customer, sort and page size', () => {
        const conditions = [{ columnKey: 'amount', operator: 'gt' as const, value: '100' }];
        const sort = { field: 'amount' as const, dir: 'ASC' as const };
        const url = toSettlementsUrlState(
            { search: '9', view: 'some-type', conditions },
            'cp-1',
            sort,
            20,
        );
        expect(fromSettlementsUrlState(url)).toEqual({
            filters: { search: '9', view: 'some-type', conditions },
            sort,
            counterpartyId: 'cp-1',
            pageSize: 20,
        });
    });

    it('falls back to defaults for an unknown sort field or page size', () => {
        const parsed = fromSettlementsUrlState({
            ...SETTLEMENTS_URL_DEFAULTS,
            pageSize: 'x',
            sortField: 'orderCode',
        });
        expect(parsed.pageSize).toBe(10);
        expect(parsed.sort).toEqual({ field: 'date', dir: 'DESC' });
    });

    it('restores a stored view and ignores junk', () => {
        expect(restoreSettlementsFilters({ search: 5, view: 3, conditions: 3 })).toEqual({
            search: '',
            view: 'all',
            conditions: [],
        });
    });
});

describe('conditionsToSettlementsFilter', () => {
    it('maps builder fields to the server filter, amount in minor units', () => {
        expect(
            conditionsToSettlementsFilter([
                { columnKey: 'amount', operator: 'gt', value: '12.5' },
                { columnKey: 'order', operator: 'eq', value: '1000' },
                { columnKey: 'type', operator: 'contains', value: 'Sale' },
            ]),
        ).toEqual({
            amount: { gt: 1250 },
            orderCode: { eq: '1000' },
            typeLabel: { contains: 'Sale' },
        });
    });

    it('is undefined without conditions', () => {
        expect(conditionsToSettlementsFilter([])).toBeUndefined();
    });
});

describe('toSettlementRows', () => {
    const item = {
        id: '1',
        documentType: 't',
        documentTypeLabel: 'Payment',
        category: 'payment',
        number: 'A-1',
        date: '2026-01-01T00:00:00Z',
        counterpartyId: '5',
        counterpartyShortName: null,
        organizationName: null,
        contractName: 'Main',
        currencyCode: 'RUB',
        amount: -150000,
        orderCodes: ['1000'],
        proformaInvoiceNumber: null,
    } as SettlementListItem;

    it('keeps the ERP number, signs the amount and maps the category to a badge', () => {
        const [row] = toSettlementRows([item]);
        expect(row).toMatchObject({
            number: 'A-1',
            customer: '—',
            type: 'Payment',
            typeVariant: documentTypeVariant(item.documentType),
            proformaInvoice: '',
            orderCodes: ['1000'],
        });
        expect(row.amount).toContain('-');
        expect(formatSettlementAmount(100, 'RUB')).toContain('+');
    });
});
