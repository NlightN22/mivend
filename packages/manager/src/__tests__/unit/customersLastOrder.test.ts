import { describe, it, expect } from 'vitest';
import { buildCustomersColumns } from '../../components/customers/customersColumns';
import { toCustomerRows } from '../../components/customers/customersRows';
import { conditionsToCustomersFilter } from '../../api/customersFilter';
import { CUSTOMERS_SORT_FIELDS } from '../../api/customersList';
import type { CustomerListItem } from '../../api/customers';

const lastOrderColumn = () =>
    buildCustomersColumns({ managers: [] }).find(c => c.field === 'lastOrder');

describe('customers list: last order column', () => {
    it('is a sortable date filter column keyed to lastOrderAt', () => {
        expect(lastOrderColumn()).toMatchObject({ filterType: 'date', sortField: 'lastOrderAt' });
        expect(CUSTOMERS_SORT_FIELDS).toContain('lastOrderAt');
    });

    it('turns a before condition on the column into a server filter on lastOrderAt', () => {
        const filter = conditionsToCustomersFilter([
            { columnKey: 'lastOrder', operator: 'before', value: '2026-01-10' },
        ]);
        expect(filter?.lastOrderAt).toHaveProperty('before');
    });

    it('turns never ordered into isNull', () => {
        const filter = conditionsToCustomersFilter([
            { columnKey: 'lastOrder', operator: 'isNull', value: '' },
        ]);
        expect(filter).toEqual({ lastOrderAt: { isNull: true } });
    });

    it('shows the date from the list item and a dash when never ordered', () => {
        const sources = {
            credit: new Map(),
            discountCounts: new Map(),
            managerName: () => '',
            branchName: () => '',
            formatMoney: (v: number) => String(v),
        };
        const base = { shortName: 'customer-123', contacts: [] };
        const items = [
            { ...base, id: 'c1', lastOrderAt: '2026-01-10T12:00:00.000Z' },
            { ...base, id: 'c2', lastOrderAt: null },
        ] as unknown as CustomerListItem[];
        const [ordered, never] = toCustomerRows(items, sources);
        expect(ordered.lastOrder).not.toBe('—');
        expect(never.lastOrder).toBe('—');
    });
});
