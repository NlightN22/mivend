import { describe, expect, it } from 'vitest';
import { toVendureFilter } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { CUSTOMERS_FILTER_COLUMNS } from '../../api/customersFilter';

describe('customers table reference column', () => {
    const column = CUSTOMERS_FILTER_COLUMNS.find(c => c.key === 'shortName')!;

    it('declares the customer name as a reference column with a lookup', () => {
        expect(column.type).toBe('reference');
        expect(column.operators).toEqual(['contains', 'in', 'notIn']);
        expect(column.suggest).toBeTypeOf('function');
    });

    it('sends picked names as the list filter in/notIn', () => {
        expect(
            toVendureFilter(
                [{ columnKey: 'shortName', operator: 'in', value: ['Alpha', 'Beta'] }],
                CUSTOMERS_FILTER_COLUMNS,
            ),
        ).toEqual({ shortName: { in: ['Alpha', 'Beta'] } });
        expect(
            toVendureFilter(
                [{ columnKey: 'shortName', operator: 'notIn', value: ['Gamma'] }],
                CUSTOMERS_FILTER_COLUMNS,
            ),
        ).toEqual({ shortName: { notIn: ['Gamma'] } });
    });
});
