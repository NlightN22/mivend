export type FilterType = 'string' | 'number' | 'date' | 'boolean' | 'select' | 'id';

export type FilterOperator =
    | 'contains'
    | 'notContains'
    | 'startsWith'
    | 'endsWith'
    | 'eq'
    | 'notEq'
    | 'isNull'
    | 'notNull'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'between'
    | 'before'
    | 'after'
    | 'isTrue'
    | 'isFalse'
    | 'in'
    | 'notIn';

// Scalar for one-value operators, `[from, to]` for between, a list for in/notIn. Dates are `YYYY-MM-DD`.
export type FilterValue = string | string[];

export interface FilterCondition {
    columnKey: string;
    operator: FilterOperator;
    value: FilterValue;
}

export interface FilterOption {
    value: string;
    label: string;
}

// What a table column declares to take part in the filter builder.
export interface FilterColumn {
    key: string;
    label: string;
    type: FilterType;
    options?: FilterOption[];
    // Narrows the type's operator list, e.g. a select the server only matches by one value.
    operators?: FilterOperator[];
    // Server field when it differs from `key`.
    serverField?: string;
    // Number columns: multiplier from the typed value to the stored one (major to minor units).
    scale?: number;
}
