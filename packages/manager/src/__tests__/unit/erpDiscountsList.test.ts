import { describe, it, expect } from 'vitest';
import {
    ERP_DISCOUNTS_VIEWS,
    ERP_DISCOUNT_STATUS_VARIANT,
    restoreErpDiscountsFilters,
    toErpDiscountsOptions,
    type ErpDiscountItem,
} from '../../api/erpDiscountsList';
import {
    ERP_DISCOUNTS_URL_DEFAULTS,
    fromErpDiscountsUrlState,
    toErpDiscountsUrlState,
} from '../../composables/erpDiscountsListUrl';
import { ERP_DISCOUNTS_COLUMNS } from '../../components/discounts/erpDiscountsColumns';
import { toErpDiscountRows } from '../../components/discounts/erpDiscountsRows';
import { erpSortFromState, erpSortToState } from '../../components/discounts/erpDiscountsSort';

function item(over: Partial<ErpDiscountItem> = {}): ErpDiscountItem {
    return {
        id: '1',
        documentNumber: '9100',
        percent: 7.8,
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2026-12-31T00:00:00.000Z',
        status: 'running',
        inactiveReason: null,
        priceTypeCode: 'price-type-wholesale',
        allProducts: true,
        productMode: 'list',
        productCount: 0,
        recipientCount: 1,
        counterparties: [{ id: '5', name: 'customer-101', contractErpId: null }],
        ...over,
    };
}
const row = (over: Partial<ErpDiscountItem> = {}) => toErpDiscountRows([item(over)])[0];

describe('ERP discount rows', () => {
    it('links a single visible customer and keeps the raw document number', () => {
        const r = row();
        expect(r.number).toBe('9100');
        expect(r.customer).toEqual({
            label: 'customer-101',
            href: '/customers/5',
            suffix: '',
            title: null,
        });
    });

    it('says All customers when the setup names nobody', () => {
        expect(row({ recipientCount: 0, counterparties: [] }).customer.label).toBe('All customers');
    });

    it('counts several customers and lists the visible names in the title', () => {
        const r = row({
            recipientCount: 2,
            counterparties: [
                { id: '5', name: 'customer-101', contractErpId: null },
                { id: '6', name: 'customer-102', contractErpId: null },
            ],
        });
        expect(r.customer).toEqual({
            label: '2 customers',
            href: null,
            suffix: '',
            title: 'customer-101, customer-102',
        });
    });

    it('shows name +K more when the caller sees fewer names than the total', () => {
        const r = row({ recipientCount: 4 });
        expect(r.customer.label).toBe('customer-101');
        expect(r.customer.suffix).toBe(' +3 more');
    });

    it('gives no link for an unimported customer and no names when none is visible', () => {
        expect(
            row({ counterparties: [{ id: null, name: 'customer-101', contractErpId: null }] })
                .customer.href,
        ).toBeNull();
        const hidden = row({ recipientCount: 3, counterparties: [] }).customer;
        expect(hidden).toEqual({ label: '3 customers', href: null, suffix: '', title: null });
    });

    it('renders a discount with a minus and a negative percent as a markup', () => {
        expect(row({ percent: 7.8 })).toMatchObject({ percentLabel: '-7.8%', markup: false });
        expect(row({ percent: -4 })).toMatchObject({ percentLabel: '+4%', markup: true });
    });

    it('describes the product scope', () => {
        expect(row().products).toBe('All products');
        expect(row({ allProducts: false, productCount: 12 }).products).toBe('12 products');
        expect(row({ allProducts: false, productCount: 1 }).products).toBe('1 product');
        expect(row({ allProducts: false, productMode: 'filter' }).products).toBe('By filter');
    });

    it('keeps an open end and shows the inactive reason only for inactive setups', () => {
        expect(row({ validTo: null }).validTo).toBeNull();
        expect(row({ priceTypeCode: null }).priceType).toBe('—');
        const inactive = row({ status: 'inactive', inactiveReason: 'cancelled' });
        expect(inactive).toMatchObject({
            inactiveReason: 'cancelled',
            statusLabel: 'Inactive',
            statusVariant: 'danger',
        });
        expect(row({ inactiveReason: 'cancelled' }).inactiveReason).toBeNull();
    });
});

describe('ERP discount chips', () => {
    it('gives every status chip a badge variant and All none', () => {
        const statuses = ERP_DISCOUNTS_VIEWS.map(v => v.key).filter(k => k !== 'all');
        expect(Object.keys(ERP_DISCOUNT_STATUS_VARIANT).sort()).toEqual([...statuses].sort());
        expect(ERP_DISCOUNT_STATUS_VARIANT).toEqual({
            running: 'success',
            'expiring-soon': 'warning',
            upcoming: 'info',
            expired: 'neutral',
            inactive: 'danger',
        });
    });
});

describe('ERP discounts list options', () => {
    it('maps filters, paging and sort to the server options', () => {
        expect(
            toErpDiscountsOptions({ search: '91', view: 'running' }, 'cp-1', 3, 20, {
                field: 'percent',
                dir: 'ASC',
            }),
        ).toEqual({
            skip: 40,
            take: 20,
            status: 'running',
            search: '91',
            counterpartyId: 'cp-1',
            sort: { field: 'percent', direction: 'ASC' },
        });
    });

    it('omits the empty search, the All chip and the fixed customer', () => {
        const o = toErpDiscountsOptions({ search: '', view: 'all' }, '', 1, 10, {
            field: 'validFrom',
            dir: 'DESC',
        });
        expect(o.status).toBeUndefined();
        expect(o.search).toBeUndefined();
        expect(o.counterpartyId).toBeUndefined();
    });
});

describe('ERP discounts URL state', () => {
    it('round-trips search, chip, sort and page size', () => {
        const filters = { search: '9101', view: 'expiring-soon' as const };
        const sort = { field: 'validTo' as const, dir: 'ASC' as const };
        expect(fromErpDiscountsUrlState(toErpDiscountsUrlState(filters, sort, 20))).toEqual({
            filters,
            sort,
            pageSize: 20,
        });
    });

    it('falls back for junk values', () => {
        const parsed = fromErpDiscountsUrlState({
            ...ERP_DISCOUNTS_URL_DEFAULTS,
            view: 'paid',
            sortField: 'priceType',
            pageSize: 'x',
        });
        expect(parsed.filters.view).toBe('all');
        expect(parsed.sort).toEqual({ field: 'validFrom', dir: 'DESC' });
        expect(parsed.pageSize).toBe(10);
    });

    it('restores a stored view and ignores junk', () => {
        expect(restoreErpDiscountsFilters({ search: 'a', view: 'upcoming' })).toEqual({
            search: 'a',
            view: 'upcoming',
        });
        expect(restoreErpDiscountsFilters({ search: 5, view: 'x' })).toEqual({
            search: '',
            view: 'all',
        });
    });
});

describe('ERP discounts sort mapping', () => {
    it('maps the server sort fields to columns and back', () => {
        for (const field of ['documentNumber', 'validFrom', 'validTo', 'percent'] as const) {
            const state = erpSortToState({ field, dir: 'ASC' }, ERP_DISCOUNTS_COLUMNS);
            expect(state).toHaveLength(1);
            expect(erpSortFromState(state, ERP_DISCOUNTS_COLUMNS)).toEqual({ field, dir: 'ASC' });
        }
    });

    it('sorts only on columns the server sorts and falls back to the default otherwise', () => {
        const sortable = ERP_DISCOUNTS_COLUMNS.filter(c => c.sortField).map(c => c.sortField);
        expect(sortable.sort()).toEqual(['documentNumber', 'percent', 'validFrom', 'validTo']);
        expect(erpSortFromState([{ field: 'customer', order: 1 }], ERP_DISCOUNTS_COLUMNS)).toEqual({
            field: 'validFrom',
            dir: 'DESC',
        });
        expect(erpSortFromState([], ERP_DISCOUNTS_COLUMNS)).toEqual({
            field: 'validFrom',
            dir: 'DESC',
        });
    });
});

describe('ERP discounts columns', () => {
    it('has the number first, valid from second, one required column and one badge', () => {
        expect(ERP_DISCOUNTS_COLUMNS.map(c => c.field).slice(0, 2)).toEqual([
            'number',
            'validFrom',
        ]);
        expect(ERP_DISCOUNTS_COLUMNS.filter(c => c.required).map(c => c.field)).toEqual(['number']);
        expect(ERP_DISCOUNTS_COLUMNS.filter(c => c.mobile?.primary)).toHaveLength(1);
        expect(ERP_DISCOUNTS_COLUMNS.filter(c => c.mobile?.badge)).toHaveLength(1);
    });
});
