import type { FilterColumn, FilterCondition, FilterOperator } from './filterBuilderTypes';
import { isValueComplete, operatorsFor } from './filterOperators';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(iso: string): number {
    return new Date(`${iso}T00:00:00`).getTime();
}
const dayStartIso = (iso: string): string => new Date(startOfDay(iso)).toISOString();
const dayEndIso = (iso: string): string => new Date(startOfDay(iso) + DAY_MS).toISOString();

function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const INT32_MAX = 2147483647;

// Number columns are 32-bit integers in the database; a larger value would fail the whole query.
function scaled(text: string, column: FilterColumn): number {
    const value = Math.round(Number(text) * (column.scale ?? 1) * 1e6) / 1e6;
    return Math.max(-INT32_MAX, Math.min(INT32_MAX, value));
}

function singleValue(condition: FilterCondition): string {
    return Array.isArray(condition.value) ? '' : condition.value;
}

function numberOperators(c: FilterCondition, column: FilterColumn): Record<string, unknown> {
    if (c.operator === 'between') {
        const [from, to] = c.value as string[];
        return { between: { start: scaled(from, column), end: scaled(to, column) } };
    }
    return { [c.operator]: scaled(singleValue(c), column) };
}

function dateOperators(c: FilterCondition): Record<string, unknown> {
    if (c.operator === 'between') {
        const [from, to] = c.value as string[];
        return { between: { start: dayStartIso(from), end: dayEndIso(to) } };
    }
    const day = singleValue(c);
    return c.operator === 'before' ? { before: dayStartIso(day) } : { after: dayEndIso(day) };
}

function stringOperators(c: FilterCondition): Record<string, unknown> {
    const text = singleValue(c);
    switch (c.operator) {
        case 'startsWith':
            return { regex: `^${escapeRegex(text)}` };
        case 'endsWith':
            return { regex: `${escapeRegex(text)}$` };
        case 'isNull':
            return { isNull: true };
        case 'notNull':
            return { isNull: false };
        case 'in':
        case 'notIn':
            return { [c.operator]: c.value };
        default:
            return { [c.operator]: text };
    }
}

const NUMERIC_OPERATORS: FilterOperator[] = ['gt', 'gte', 'lt', 'lte', 'between'];

function operatorsOf(c: FilterCondition, column: FilterColumn): Record<string, unknown> {
    if (column.type === 'boolean') return { eq: c.operator === 'isTrue' };
    if (column.type === 'date' && c.operator !== 'isNull') return dateOperators(c);
    if (column.type === 'number' && (c.operator === 'eq' || NUMERIC_OPERATORS.includes(c.operator)))
        return numberOperators(c, column);
    return stringOperators(c);
}

// The first condition on a field is flat; further ones on the same field go to `_and`.
export function toVendureFilter(
    conditions: FilterCondition[],
    columns: FilterColumn[],
): Record<string, unknown> {
    const filter: Record<string, unknown> = {};
    const extra: Record<string, unknown>[] = [];
    for (const c of conditions) {
        const column = columns.find(col => col.key === c.columnKey);
        if (!column || !operatorsFor(column).includes(c.operator)) continue;
        if (!isValueComplete(c.operator, c.value)) continue;
        const field = column.serverField ?? column.key;
        const piece = { [field]: operatorsOf(c, column) };
        if (field in filter) extra.push(piece);
        else Object.assign(filter, piece);
    }
    if (extra.length) filter._and = extra;
    return filter;
}
