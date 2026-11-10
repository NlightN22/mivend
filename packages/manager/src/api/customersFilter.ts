import { toVendureFilter } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import type { FilterCondition } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { toFilterColumns } from '@mivend/ui-kit/src/components/MvAdvancedDataTable/advancedDataTableTypes';
import { buildCustomersColumns, UNASSIGNED } from '../components/customers/customersColumns';
import { mergeFilters } from './orders-filter';
import type { CounterpartyFilterParameter } from './generated/graphql';

export const CUSTOMERS_FILTER_COLUMNS = toFilterColumns(buildCustomersColumns({ managers: [] }));

// "Unassigned" is a null value, not a value: it becomes an emptiness test on the field.
export function conditionsToCustomersFilter(
    conditions: FilterCondition[],
): CounterpartyFilterParameter | undefined {
    const generic: FilterCondition[] = [];
    let extra: Record<string, unknown> = {};
    for (const c of conditions) {
        const field = c.columnKey === 'branch' ? 'branchId' : 'managerErpId';
        const isUnassigned =
            (c.columnKey === 'branch' || c.columnKey === 'manager') && c.value === UNASSIGNED;
        if (isUnassigned) extra = mergeFilters(extra, { [field]: { isNull: c.operator === 'eq' } });
        else generic.push(c);
    }
    const filter = mergeFilters(toVendureFilter(generic, CUSTOMERS_FILTER_COLUMNS), extra);
    return Object.keys(filter).length ? (filter as CounterpartyFilterParameter) : undefined;
}
