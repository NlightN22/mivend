import type { FilterColumn, FilterCondition } from './filterBuilderTypes';
import { operatorChipLabel, operatorValueKind } from './filterOperators';

function displayDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return y && m && d ? `${d}.${m}.${y}` : iso;
}

function displayOne(column: FilterColumn, value: string): string {
    if (column.type === 'date') return displayDate(value);
    return column.options?.find(o => o.value === value)?.label ?? value;
}

// The chip text, e.g. `Total > 1000` or `Status is any of Shipped, Delivered`.
export function describeCondition(condition: FilterCondition, column: FilterColumn): string {
    const op = operatorChipLabel(column, condition.operator);
    const kind = operatorValueKind(condition.operator);
    if (kind === 'none') return `${column.label} ${op}`;
    const values = Array.isArray(condition.value) ? condition.value : [condition.value];
    const shown = values.map(v => displayOne(column, v));
    if (kind === 'range') return `${column.label} ${shown[0]} – ${shown[1]}`;
    return `${column.label} ${op} ${shown.join(', ')}`;
}
