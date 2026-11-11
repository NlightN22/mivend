import { describe, it, expect } from 'vitest';
import {
    DISCOUNTS_SORT_FIELDS,
    restoreDiscountsFilters,
    type DiscountRegistryItem,
} from '../../api/discountsList';
import {
    DISCOUNTS_URL_DEFAULTS,
    fromDiscountsUrlState,
    toDiscountsUrlState,
} from '../../composables/discountsListUrl';
import { conditionsToDiscountsFilter } from '../../api/discountsFilter';
import { DISCOUNTS_COLUMNS } from '../../components/discounts/discountsColumns';
import { toDiscountRows } from '../../components/discounts/discountsRows';

describe('discounts list URL state', () => {
    it('round-trips search, view, conditions, sort and page size', () => {
        const conditions = [{ columnKey: 'percent', operator: 'gt' as const, value: '5' }];
        const sort = { field: 'validTo' as const, dir: 'ASC' as const };
        const url = toDiscountsUrlState(
            { search: '1000', view: 'expiring-soon', conditions },
            sort,
            20,
        );
        expect(fromDiscountsUrlState(url)).toEqual({
            filters: { search: '1000', view: 'expiring-soon', conditions },
            sort,
            pageSize: 20,
        });
    });

    it('keeps a customer name arriving as ?search= and falls back for junk', () => {
        const parsed = fromDiscountsUrlState({
            ...DISCOUNTS_URL_DEFAULTS,
            search: 'customer-101',
            view: 'paid',
            pageSize: 'x',
            sortField: 'justification',
        });
        expect(parsed.filters.search).toBe('customer-101');
        expect(parsed.filters.view).toBe('all');
        expect(parsed.pageSize).toBe(10);
        expect(parsed.sort).toEqual({ field: 'createdAt', dir: 'DESC' });
    });

    it('restores a stored view and ignores junk', () => {
        expect(restoreDiscountsFilters({ search: 'a', view: 'pending' })).toEqual({
            search: 'a',
            view: 'pending',
            conditions: [],
        });
        expect(restoreDiscountsFilters({ search: 5, view: 'x', conditions: 3 })).toEqual({
            search: '',
            view: 'all',
            conditions: [],
        });
    });
});

describe('conditionsToDiscountsFilter', () => {
    it('maps builder fields to the server filter', () => {
        expect(
            conditionsToDiscountsFilter([
                { columnKey: 'percent', operator: 'gte', value: '10' },
                { columnKey: 'status', operator: 'eq', value: 'pending' },
                { columnKey: 'date', operator: 'after', value: '2026-01-01' },
                { columnKey: 'customer', operator: 'contains', value: 'acme' },
            ]),
        ).toEqual({
            percent: { gte: 10 },
            status: { eq: 'pending' },
            createdAt: { after: expect.any(String) },
            customer: { contains: 'acme' },
        });
    });

    it('is undefined without conditions', () => {
        expect(conditionsToDiscountsFilter([])).toBeUndefined();
    });
});

describe('discounts columns', () => {
    it('puts the required number first and the creation date second', () => {
        expect(DISCOUNTS_COLUMNS[0]).toMatchObject({ field: 'number', required: true });
        expect(DISCOUNTS_COLUMNS[1]).toMatchObject({ field: 'date', filterField: 'createdAt' });
    });

    it('has one primary and one badge column on the mobile card', () => {
        expect(DISCOUNTS_COLUMNS.filter(c => c.mobile?.primary).map(c => c.field)).toEqual([
            'number',
        ]);
        expect(DISCOUNTS_COLUMNS.filter(c => c.mobile?.badge).map(c => c.field)).toEqual([
            'status',
        ]);
    });

    it('sorts only by fields the server whitelists', () => {
        for (const c of DISCOUNTS_COLUMNS.filter(c => c.sortField))
            expect(DISCOUNTS_SORT_FIELDS).toContain(c.sortField);
    });

    it('keeps every builder column on the server field name', () => {
        const serverFields = DISCOUNTS_COLUMNS.filter(c => c.filterType).map(
            c => c.filterField ?? c.field,
        );
        expect(serverFields).toEqual([
            'number',
            'createdAt',
            'customer',
            'priceType',
            'productGroup',
            'percent',
            'validFrom',
            'validTo',
            'status',
        ]);
    });
});

describe('toDiscountRows', () => {
    const NOW = Date.parse('2026-06-01T00:00:00Z');
    const day = (n: number): string => new Date(NOW + n * 86_400_000).toISOString();
    const item = (over: Partial<DiscountRegistryItem>): DiscountRegistryItem => ({
        id: '1',
        uuid: '00000000-0000-4000-8000-000000000001',
        number: '1000000001',
        createdAt: day(-5),
        approvalRequestId: '7',
        discountRuleId: '3',
        status: 'materialized',
        priceTypeCode: 'price-type-wholesale',
        facetCode: null,
        facetValueCode: null,
        percent: 10,
        validFrom: day(-5),
        validTo: day(60),
        justification: 'reason',
        counterpartyIds: null,
        ...over,
    });

    it('derives the status of a materialized entry from validTo and keeps stored ones', () => {
        const status = (over: Partial<DiscountRegistryItem>): string =>
            toDiscountRows([item(over)], new Map(), NOW)[0].status;
        expect(status({ validTo: day(60) })).toBe('active');
        expect(status({ validTo: day(5) })).toBe('expiring-soon');
        expect(status({ validTo: day(-1) })).toBe('expired');
        expect(status({ status: 'pending', validTo: day(-1) })).toBe('pending');
        expect(status({ status: 'rejected' })).toBe('rejected');
    });

    it('labels customers by live name, falls back to the id, and company-wide to all', () => {
        const names = new Map([['1', 'customer-101']]);
        const customer = (ids: string[] | null): string =>
            toDiscountRows([item({ counterpartyIds: ids })], names, NOW)[0].customer;
        expect(customer(['1', '2'])).toBe('customer-101, 2');
        expect(customer(null)).toBe('All customers');
    });

    it('marks a one-customer grant personal and any wider set as shared', () => {
        const scope = (ids: string[] | null): string[] => {
            const [r] = toDiscountRows([item({ counterpartyIds: ids })], new Map(), NOW);
            return [r.scope, String(r.shared)];
        };
        expect(scope(['1'])).toEqual(['Personal', 'false']);
        expect(scope(['1', '2'])).toEqual(['Shared with 1 more', 'true']);
        expect(scope(null)).toEqual(['All customers', 'true']);
    });

    it('renews only portal-origin rules and shows the product group or all products', () => {
        const [portal, erp] = toDiscountRows(
            [item({ facetValueCode: 'group-a' }), item({ approvalRequestId: null })],
            new Map(),
            NOW,
        );
        expect(portal.ruleErpId).toBe('portal-7');
        expect(portal.productGroup).toBe('group-a');
        expect(erp.ruleErpId).toBeNull();
        expect(erp.productGroup).toBe('All products');
    });
});
