import type { FilterCondition } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';

export const ANY = '';

// The quick selects are views onto the Filter builder's conditions, so URL sync and saved views need nothing extra.
export function quickValue(
    conditions: FilterCondition[],
    columnKey: string,
    operator: string,
): string {
    const found = conditions.find(c => c.columnKey === columnKey && c.operator === operator);
    return typeof found?.value === 'string' ? found.value : ANY;
}

export function withQuickValue(
    conditions: FilterCondition[],
    columnKey: string,
    operator: 'eq' | 'contains',
    value: string,
): FilterCondition[] {
    const rest = conditions.filter(c => c.columnKey !== columnKey);
    return value === ANY ? rest : [...rest, { columnKey, operator, value }];
}
