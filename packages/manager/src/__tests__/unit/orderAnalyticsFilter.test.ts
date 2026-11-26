import { describe, expect, it } from 'vitest';
import type { FilterCondition } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterBuilderTypes';
import {
    buildEntityFilterColumns,
    SALES_GROUP_KEYS,
    conditionsToEntityFilters,
    conditionsToGroupFilters,
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
                { columnKey: 'customer', operator: 'in', value: [] },
            ]),
        ).toEqual([
            { kind: 'CUSTOMER', values: ['alp'], exact: false },
            { kind: 'CUSTOMER', values: ['Alpha', 'Beta'], exact: true },
        ]);
    });

    it('sends "is not one of" as whole names to leave out, apart from the include list', () => {
        expect(
            conditionsToEntityFilters([
                { columnKey: 'customer', operator: 'in', value: ['Alpha'] },
                { columnKey: 'customer', operator: 'notIn', value: [' Gamma ', 'Delta'] },
                { columnKey: 'contract', operator: 'notIn', value: ['x'] },
            ]),
        ).toEqual([
            { kind: 'CUSTOMER', values: ['Alpha'], exact: true },
            { kind: 'CUSTOMER', values: ['Gamma', 'Delta'], exact: true, exclude: true },
        ]);
    });

    it('never sends a group pick as a name', () => {
        expect(
            conditionsToEntityFilters([
                { columnKey: 'product', operator: 'inGroup', value: ['1:Tools'] },
            ]),
        ).toEqual([]);
    });
});

describe('group picks', () => {
    const grp = (operator: 'inGroup' | 'notInGroup', value: string[]): FilterCondition => ({
        columnKey: 'manufacturer',
        operator,
        value,
    });

    it('sends only our group ids, include and exclude apart, never the names', () => {
        expect(
            conditionsToGroupFilters([
                grp('inGroup', ['12:Parent / Child', '13:Other']),
                grp('notInGroup', ['14:Third: with colon']),
                { columnKey: 'product', operator: 'inGroup', value: ['7:Pumps / Small'] },
                { columnKey: 'customer', operator: 'notInGroup', value: ['3:Retail'] },
            ]),
        ).toEqual([
            { kind: 'MANUFACTURER_GROUP', ids: ['12', '13'] },
            { kind: 'MANUFACTURER_GROUP', ids: ['14'], exclude: true },
            { kind: 'PRODUCT_CATEGORY', ids: ['7'] },
            { kind: 'CUSTOMER_GROUP', ids: ['3'], exclude: true },
        ]);
    });

    it('ignores plain names, empty picks and columns without a group lookup', () => {
        expect(
            conditionsToGroupFilters([
                cond('manufacturer', 'Acme'),
                grp('inGroup', []),
                { columnKey: 'organization', operator: 'inGroup', value: ['1:X'] },
            ]),
        ).toEqual([]);
    });

    it('keeps sales to counterparty groups only', () => {
        expect(
            conditionsToGroupFilters(
                [
                    { columnKey: 'customer', operator: 'inGroup', value: ['5:Wholesale'] },
                    grp('inGroup', ['1:Acme']),
                ],
                SALES_GROUP_KEYS,
            ),
        ).toEqual([{ kind: 'CUSTOMER_GROUP', ids: ['5'] }]);
    });
});

describe('filter mode helpers', () => {
    it('switches to line totals for any product or manufacturer pick, group or exclusion', () => {
        expect(
            usesProductFilter([{ columnKey: 'product', operator: 'notIn', value: ['Bolt'] }]),
        ).toBe(true);
        expect(
            usesProductFilter([{ columnKey: 'manufacturer', operator: 'inGroup', value: ['1:A'] }]),
        ).toBe(true);
        expect(
            usesProductFilter([{ columnKey: 'customer', operator: 'notIn', value: ['Alpha'] }]),
        ).toBe(false);
    });

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
    it('offers the group operators only for the groups the service supports, per report', () => {
        const ops = (
            groups: Parameters<typeof buildEntityFilterColumns>[2],
        ): Record<string, string> =>
            Object.fromEntries(
                buildEntityFilterColumns(undefined, 'orders', groups).map(c => [
                    c.key,
                    c.operators!.join(),
                ]),
            );
        expect(ops([]).manufacturer).toBe('contains,in,notIn');
        expect(ops(['MANUFACTURER_GROUP']).manufacturer).toBe(
            'contains,in,notIn,inGroup,notInGroup',
        );
        expect(ops(['MANUFACTURER_GROUP']).product).toBe('contains,in,notIn');
        const all = ops(['MANUFACTURER_GROUP', 'PRODUCT_CATEGORY', 'CUSTOMER_GROUP']);
        expect([all.product, all.customer, all.organization]).toEqual([
            'contains,in,notIn,inGroup,notInGroup',
            'contains,in,notIn,inGroup,notInGroup',
            'contains,in,notIn',
        ]);
    });

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
                c =>
                    c.type === 'reference' &&
                    c.operators?.join() === 'contains,in,notIn' &&
                    c.suggest,
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
