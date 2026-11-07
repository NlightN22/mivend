import type {
    FilterColumn,
    FilterCondition,
    FilterOperator,
    FilterValue,
} from './filterBuilderTypes';
import { isValueComplete, operatorValueKind, operatorsFor } from './filterOperators';

const CONDITION_SEPARATOR = ';';
const FIELD_SEPARATOR = ':';
const LIST_SEPARATOR = ',';

function encodeValue(value: FilterValue): string {
    return Array.isArray(value)
        ? value.map(encodeURIComponent).join(LIST_SEPARATOR)
        : encodeURIComponent(value);
}

function decodeValue(operator: FilterOperator, text: string): FilterValue {
    const kind = operatorValueKind(operator);
    if (kind === 'none') return '';
    if (kind === 'single') return decodeURIComponent(text);
    return text === '' ? [] : text.split(LIST_SEPARATOR).map(decodeURIComponent);
}

// `total:gt:1000;state:in:A,B` — every part is percent-encoded, so values can hold any text.
export function conditionsToQuery(conditions: FilterCondition[]): string {
    return conditions
        .map(c =>
            [encodeURIComponent(c.columnKey), c.operator, encodeValue(c.value)].join(
                FIELD_SEPARATOR,
            ),
        )
        .join(CONDITION_SEPARATOR);
}

// Drops anything that does not name a known column, one of its operators and a complete value.
export function sanitizeConditions(raw: unknown, columns: FilterColumn[]): FilterCondition[] {
    if (!Array.isArray(raw)) return [];
    const result: FilterCondition[] = [];
    for (const item of raw) {
        if (typeof item !== 'object' || item === null) continue;
        const { columnKey, operator, value } = item as Record<string, unknown>;
        const column = columns.find(c => c.key === columnKey);
        if (!column || typeof operator !== 'string') continue;
        if (!operatorsFor(column).includes(operator as FilterOperator)) continue;
        const kind = operatorValueKind(operator as FilterOperator);
        const shapeOk =
            kind === 'none' ||
            (kind === 'single' && typeof value === 'string') ||
            (Array.isArray(value) && value.every(v => typeof v === 'string'));
        if (!shapeOk) continue;
        if (!isValueComplete(operator as FilterOperator, value as FilterValue)) continue;
        result.push({
            columnKey: column.key,
            operator: operator as FilterOperator,
            value: kind === 'none' ? '' : (value as FilterValue),
        });
    }
    return result;
}

export function conditionsFromQuery(text: string, columns: FilterColumn[]): FilterCondition[] {
    if (!text) return [];
    const raw = text.split(CONDITION_SEPARATOR).map(part => {
        const [key = '', operator = '', value = ''] = part.split(FIELD_SEPARATOR);
        try {
            const columnKey = decodeURIComponent(key);
            return { columnKey, operator, value: decodeValue(operator as FilterOperator, value) };
        } catch {
            return null;
        }
    });
    return sanitizeConditions(raw, columns);
}
