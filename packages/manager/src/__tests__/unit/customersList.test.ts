import { describe, it, expect } from 'vitest';
import {
    customersListFilter,
    restoreCustomersFilters,
    type CustomersListFilters,
} from '../../api/customersList';
import { conditionsToCustomersFilter } from '../../api/customersFilter';
import {
    CUSTOMERS_URL_DEFAULTS,
    fromCustomersUrlState,
    toCustomersUrlState,
} from '../../composables/customersListUrl';
import { innStatusBadge, toCustomerRows } from '../../components/customers/customersRows';
import type { CustomerListItem } from '../../api/customers';

describe('customers list URL state', () => {
    it('round-trips search, view, conditions, sort and page size', () => {
        const conditions = [
            { columnKey: 'innStatus', operator: 'eq' as const, value: 'duplicate' },
        ];
        const filters: CustomersListFilters = { search: 'a', view: 'active', conditions };
        const sort = { field: 'inn' as const, dir: 'DESC' as const };
        expect(fromCustomersUrlState(toCustomersUrlState(filters, sort, 50))).toEqual({
            filters,
            sort,
            pageSize: 50,
        });
    });

    it('falls back to defaults for an unknown view, sort field or page size', () => {
        const parsed = fromCustomersUrlState({
            ...CUSTOMERS_URL_DEFAULTS,
            view: 'x',
            sortField: 'noSuchField',
            pageSize: 'x',
        });
        expect(parsed.filters.view).toBe('all');
        expect(parsed.sort).toEqual({ field: 'shortName', dir: 'ASC' });
        expect(parsed.pageSize).toBe(20);
    });

    it('restores a stored view and ignores junk', () => {
        expect(restoreCustomersFilters({ search: 5, view: 3, conditions: 3 })).toEqual({
            search: '',
            view: 'all',
            conditions: [],
        });
    });
});

describe('conditionsToCustomersFilter', () => {
    it('maps builder columns to the server fields', () => {
        expect(
            conditionsToCustomersFilter([
                { columnKey: 'group', operator: 'contains', value: 'whole' },
                { columnKey: 'innStatus', operator: 'eq', value: 'missing' },
                { columnKey: 'isActive', operator: 'isTrue', value: '' },
            ]),
        ).toEqual({
            erpGroupLabel: { contains: 'whole' },
            innStatus: { eq: 'missing' },
            isActive: { eq: true },
        });
    });

    it('turns Unassigned into an emptiness test, for the branch and the manager', () => {
        expect(
            conditionsToCustomersFilter([
                { columnKey: 'branch', operator: 'eq', value: 'unassigned' },
                { columnKey: 'manager', operator: 'notEq', value: 'unassigned' },
            ]),
        ).toEqual({ branchId: { isNull: true }, managerErpId: { isNull: false } });
    });

    it('is undefined without conditions', () => {
        expect(conditionsToCustomersFilter([])).toBeUndefined();
    });
});

describe('customersListFilter', () => {
    const blank: CustomersListFilters = { search: '', view: 'all', conditions: [] };

    it('keeps a fixed filter beside the builder, never replacing it', () => {
        const filters = {
            ...blank,
            conditions: [{ columnKey: 'inn', operator: 'contains' as const, value: '77' }],
        };
        expect(customersListFilter(filters, { branchId: { eq: 'branch-a' } })).toEqual({
            branchId: { eq: 'branch-a' },
            inn: { contains: '77' },
        });
    });

    it('lets both hold when they name the same field', () => {
        const filters = {
            ...blank,
            conditions: [{ columnKey: 'branch', operator: 'eq' as const, value: 'branch-b' }],
        };
        expect(customersListFilter(filters, { branchId: { eq: 'branch-a' } })).toEqual({
            branchId: { eq: 'branch-a' },
            _and: [{ branchId: { eq: 'branch-b' } }],
        });
    });
});

describe('toCustomerRows', () => {
    const item = {
        id: 'c1',
        shortName: 'customer-123',
        inn: null,
        innStatus: 'missing',
        isActive: true,
        assignedManagerId: 'm1',
        branchId: 'branch-a',
        erpGroupLabel: null,
        contacts: [],
    } as unknown as CustomerListItem;

    it('maps a customer with no credit, contact or orders to dashes', () => {
        const [row] = toCustomerRows([item], {
            credit: new Map(),
            discountCounts: new Map(),
            managerName: id => `manager-${id}`,
            branchName: id => `name-${id}`,
            formatMoney: v => String(v),
        });
        expect(row).toMatchObject({
            id: 'c1',
            inn: '',
            manager: 'manager-m1',
            branch: 'name-branch-a',
            contact: '—',
            creditBalance: '—',
            creditUsagePercent: null,
            lastOrder: '—',
        });
    });

    it('flags a missing or duplicate INN and treats an unknown status as OK', () => {
        expect(innStatusBadge('duplicate').variant).toBe('danger');
        expect(innStatusBadge('missing').variant).toBe('warning');
        expect(innStatusBadge('?').label).toBe('OK');
    });
});

describe('customers list: manager source and credit, readiness filters', () => {
    it('passes the ERP manager id to the column so it matches the filter field', () => {
        const item = {
            id: 'c1',
            shortName: 'customer-123',
            assignedManagerId: 'm1',
            managerErpId: 'erp-m1',
            portalReadiness: 'ready',
            contacts: [],
        } as unknown as CustomerListItem;
        const [row] = toCustomerRows([item], {
            credit: new Map(),
            discountCounts: new Map(),
            managerName: (_id, erpId) => `name-of-${erpId}`,
            branchName: () => '',
            formatMoney: v => String(v),
        });
        expect(row.manager).toBe('name-of-erp-m1');
        expect(row.readiness).toBe('Ready to activate');
    });

    it('builds server filters for credit and portal readiness', () => {
        expect(
            conditionsToCustomersFilter([
                { columnKey: 'creditLimit', operator: 'gte', value: '100' },
                { columnKey: 'readiness', operator: 'eq', value: 'activated' },
            ]),
        ).toEqual({ creditLimit: { gte: 100 }, readiness: { eq: 'activated' } });
    });
});
