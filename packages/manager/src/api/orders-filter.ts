import {
    toVendureFilter,
    type FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { toFilterColumns } from '@mivend/ui-kit/src/components/MvAdvancedDataTable/advancedDataTableTypes';
import { ALL_COLUMNS } from '../components/orders/ordersColumns';
import { PLACED_BY_CUSTOMER_VALUE } from './customers';

export const ORDERS_FILTER_COLUMNS = toFilterColumns(ALL_COLUMNS);

// Both filters hold at once: disjoint fields merge, a clash goes through `_and`.
export function mergeFilters(
    base: Record<string, unknown>,
    extra: Record<string, unknown>,
): Record<string, unknown> {
    const merged = { ...base };
    const andList = Array.isArray(merged._and) ? [...(merged._and as unknown[])] : [];
    for (const [field, operators] of Object.entries(extra)) {
        if (field === '_and') andList.push(...(operators as unknown[]));
        else if (field in merged) andList.push({ [field]: operators });
        else merged[field] = operators;
    }
    if (andList.length) merged._and = andList;
    return merged;
}

export interface OrdersServerFilter {
    filter: Record<string, unknown>;
    managerId?: string;
}

// The manager is a query argument, and "placed by the customer" is a null admin id, not a value.
export function conditionsToOrdersFilter(conditions: FilterCondition[]): OrdersServerFilter {
    const generic: FilterCondition[] = [];
    let managerId: string | undefined;
    let customerPlaced: Record<string, unknown> | undefined;
    for (const c of conditions) {
        if (c.columnKey === 'manager' && typeof c.value === 'string') managerId = c.value;
        else if (c.columnKey === 'placedBy' && c.value === PLACED_BY_CUSTOMER_VALUE)
            customerPlaced = { isNull: c.operator === 'eq' };
        else generic.push(c);
    }
    let filter = toVendureFilter(generic, ORDERS_FILTER_COLUMNS);
    if (customerPlaced) filter = mergeFilters(filter, { placedByAdministratorId: customerPlaced });
    return { filter, managerId };
}

// The server has no regex operator, so a stored starts/ends-with on the number now reads as contains.
export function upgradeStoredConditions(raw: unknown): unknown {
    if (!Array.isArray(raw)) return raw;
    return raw.map(item => {
        const c = item as Record<string, unknown> | null;
        const legacy =
            c?.columnKey === 'code' && (c.operator === 'startsWith' || c.operator === 'endsWith');
        return legacy ? { ...c, operator: 'contains' } : item;
    });
}
