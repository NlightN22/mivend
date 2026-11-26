import { describe, expect, it } from 'vitest';
import type { FilterCondition } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterBuilderTypes';
import {
    buildEntityFilterColumns,
    conditionsToEntityFilters,
    usesCounterpartyManager,
    usesProductFilter,
} from '../../api/orderAnalyticsFilter';
import { buildOrderAnalyticsColumns } from '../../components/analytics/orderAnalyticsColumns';

const cond = (columnKey: string, value: string): FilterCondition => ({
    columnKey,
    operator: 'contains' as const,
    value,
});

describe('conditionsToEntityFilters', () => {
    it('groups the typed names by entity kind and trims them', () => {
        expect(
            conditionsToEntityFilters([
                cond('product', ' bolt '),
                cond('product', 'nut'),
                cond('manufacturer', 'Acme'),
            ]),
        ).toEqual([
            { kind: 'PRODUCT', values: ['bolt', 'nut'], exact: false },
            { kind: 'MANUFACTURER', values: ['Acme'], exact: false },
        ]);
    });

    it('sends nothing for blank values and for keys that are not entity filters', () => {
        expect(conditionsToEntityFilters([cond('customer', '  '), cond('other', 'x')])).toEqual([]);
    });
});

describe('picked objects', () => {
    it('sends "is one of" as exact values apart from typed contains names', () => {
        expect(
            conditionsToEntityFilters([
                cond('customer', 'alp'),
                { columnKey: 'customer', operator: 'in', value: ['Alpha', ' Beta '] },
                { columnKey: 'customer', operator: 'notIn', value: ['Gamma'] },
                { columnKey: 'customer', operator: 'in', value: [] },
            ]),
        ).toEqual([
            { kind: 'CUSTOMER', values: ['alp'], exact: false },
            { kind: 'CUSTOMER', values: ['Alpha', 'Beta'], exact: true },
        ]);
    });
});

describe('filter mode helpers', () => {
    it('switches to line totals only for a product or manufacturer name', () => {
        expect(usesProductFilter([cond('product', 'bolt')])).toBe(true);
        expect(usesProductFilter([cond('manufacturer', 'Acme')])).toBe(true);
        expect(usesProductFilter([cond('customer', 'x'), cond('product', ' ')])).toBe(false);
    });

    it('offers the main-manager switch for a customer manager name', () => {
        expect(usesCounterpartyManager([cond('counterpartyManager', 'Ann')])).toBe(true);
        expect(usesCounterpartyManager([cond('manager', 'Ann')])).toBe(false);
    });
});

describe('builder columns and table columns', () => {
    it('offers the seven entity filters with a name-contains operator and a typeahead', () => {
        const columns = buildEntityFilterColumns();
        expect(columns.map(c => c.key)).toEqual([
            'customer',
            'organization',
            'pointOfSale',
            'manager',
            'counterpartyManager',
            'product',
            'manufacturer',
        ]);
        expect(
            columns.every(
                c => c.type === 'reference' && c.operators?.join() === 'contains,in' && c.suggest,
            ),
        ).toBe(true);
    });

    it('replaces the order amounts by the line totals in product mode', () => {
        const fields = (productMode: boolean): string[] =>
            buildOrderAnalyticsColumns(false, productMode).map(c => c.field);
        expect(fields(false)).toContain('turnover');
        expect(fields(false)).not.toContain('productAmount');
        expect(fields(true)).toContain('productAmount');
        expect(fields(true)).not.toContain('turnover');
    });
});
