import type { FilterColumn, FilterOperator, FilterType, FilterValue } from './filterBuilderTypes';

export type OperatorValueKind = 'none' | 'single' | 'range' | 'multi';

export const OPERATORS_BY_TYPE: Record<FilterType, FilterOperator[]> = {
    string: [
        'contains',
        'notContains',
        'eq',
        'notEq',
        'startsWith',
        'endsWith',
        'isNull',
        'notNull',
    ],
    number: ['eq', 'gt', 'gte', 'lt', 'lte', 'between', 'isNull'],
    date: ['before', 'after', 'between', 'isNull'],
    boolean: ['isTrue', 'isFalse'],
    select: ['eq', 'notEq', 'in', 'notIn'],
    id: ['eq', 'notEq', 'isNull', 'notNull'],
};

export const OPERATOR_LABEL: Record<FilterOperator, string> = {
    contains: 'contains',
    notContains: 'does not contain',
    startsWith: 'starts with',
    endsWith: 'ends with',
    eq: 'is equal to',
    notEq: 'is not equal to',
    isNull: 'is empty',
    notNull: 'is not empty',
    gt: 'is greater than',
    gte: 'is greater than or equal to',
    lt: 'is less than',
    lte: 'is less than or equal to',
    between: 'is between',
    before: 'is before',
    after: 'is after',
    isTrue: 'is true',
    isFalse: 'is false',
    in: 'is any of',
    notIn: 'is none of',
};

const SELECT_LABEL: Partial<Record<FilterOperator, string>> = {
    eq: 'is',
    notEq: 'is not',
};

const SYMBOL: Partial<Record<FilterOperator, string>> = {
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤',
    eq: '=',
    notEq: '≠',
};

export function operatorsFor(column: FilterColumn): FilterOperator[] {
    const all = OPERATORS_BY_TYPE[column.type];
    return column.operators ? all.filter(op => column.operators?.includes(op)) : all;
}

export function operatorLabel(column: FilterColumn, operator: FilterOperator): string {
    return (column.type === 'select' && SELECT_LABEL[operator]) || OPERATOR_LABEL[operator];
}

// Short form for chips: numbers read as `Total > 1000`, the rest as words.
export function operatorChipLabel(column: FilterColumn, operator: FilterOperator): string {
    if (column.type === 'number' && SYMBOL[operator]) return SYMBOL[operator]!;
    return operatorLabel(column, operator);
}

export function operatorValueKind(operator: FilterOperator): OperatorValueKind {
    switch (operator) {
        case 'isNull':
        case 'notNull':
        case 'isTrue':
        case 'isFalse':
            return 'none';
        case 'between':
            return 'range';
        case 'in':
        case 'notIn':
            return 'multi';
        default:
            return 'single';
    }
}

export function emptyValueFor(operator: FilterOperator): FilterValue {
    const kind = operatorValueKind(operator);
    if (kind === 'range') return ['', ''];
    if (kind === 'multi') return [];
    return '';
}

export function isValueComplete(operator: FilterOperator, value: FilterValue): boolean {
    switch (operatorValueKind(operator)) {
        case 'none':
            return true;
        case 'single':
            return typeof value === 'string' && value.trim() !== '';
        case 'range':
            return Array.isArray(value) && value.length === 2 && value.every(v => v.trim() !== '');
        case 'multi':
            return Array.isArray(value) && value.length > 0;
    }
}
