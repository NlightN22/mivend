import { UserInputError } from '@vendure/core';
import type { SelectQueryBuilder } from 'typeorm';

import type { Counterparty } from './entities/counterparty.entity';

export const MAX_FILTER_CONDITIONS = 20;
export const MAX_FILTER_VALUES = 100;
const MAX_TEXT_LENGTH = 200;

export interface CounterpartyStringOperators {
    eq?: string;
    notEq?: string;
    contains?: string;
    notContains?: string;
    in?: string[];
    notIn?: string[];
    isNull?: boolean;
}

export interface CounterpartyFilterParameter {
    shortName?: CounterpartyStringOperators;
    inn?: CounterpartyStringOperators;
    phone?: CounterpartyStringOperators;
    officialEmail?: CounterpartyStringOperators;
    managerErpId?: CounterpartyStringOperators;
    branchId?: CounterpartyStringOperators;
    isActive?: { eq?: boolean };
    _and?: CounterpartyFilterParameter[];
}

// Fixed SQL per whitelisted field; a value only ever travels as a bound parameter.
const TEXT_COLUMNS = {
    shortName: 'c."shortName"',
    inn: 'c.inn',
    phone: 'c.phone',
    officialEmail: 'c."officialEmail"',
    managerErpId: 'c."managerErpId"',
    branchId: 'c."branchId"',
} as const;
type TextField = keyof typeof TEXT_COLUMNS;

const MANAGER_NAME_MATCH = (param: string): string => `EXISTS (
    SELECT 1 FROM erp_user eu
    WHERE eu."erpId" = c."managerErpId" AND eu."fullName" ILIKE :${param})`;

const STRING_OPERATORS = ['eq', 'notEq', 'contains', 'notContains', 'in', 'notIn', 'isNull'];
const FIELDS = [...Object.keys(TEXT_COLUMNS), 'isActive', '_and'];

function escapeLike(text: string): string {
    return text.replace(/[\\%_]/g, '\\$&');
}

function equals(column: string, exact: boolean, param: string): string {
    return exact ? `${column} = :${param}` : `lower(${column}) = lower(:${param})`;
}

function text(value: unknown): string {
    if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) {
        throw new UserInputError('Invalid filter value');
    }
    return value;
}

function list(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > MAX_FILTER_VALUES) {
        throw new UserInputError(`At most ${MAX_FILTER_VALUES} values per filter`);
    }
    return value.map(text);
}

class Builder {
    private counter = 0;
    private conditions = 0;
    readonly params: Record<string, unknown> = {};

    bind(value: unknown): string {
        const name = `cf${this.counter++}`;
        this.params[name] = value;
        return name;
    }

    countCondition(): void {
        if (++this.conditions > MAX_FILTER_CONDITIONS) {
            throw new UserInputError(`At most ${MAX_FILTER_CONDITIONS} filter conditions`);
        }
    }
}

function stringClause(field: TextField, ops: CounterpartyStringOperators, b: Builder): string[] {
    const column = TEXT_COLUMNS[field];
    const clauses: string[] = [];
    for (const [op, value] of Object.entries(ops)) {
        if (value === undefined || value === null) continue;
        if (!STRING_OPERATORS.includes(op)) {
            throw new UserInputError(`Unsupported filter operator: ${op}`);
        }
        b.countCondition();
        const exact = field === 'branchId';
        switch (op) {
            case 'eq':
                clauses.push(equals(column, exact, b.bind(text(value))));
                break;
            case 'notEq':
                clauses.push(`NOT coalesce(${equals(column, exact, b.bind(text(value)))}, false)`);
                break;
            case 'in': {
                const values = list(value);
                clauses.push(values.length ? `${column} IN (:...${b.bind(values)})` : 'false');
                break;
            }
            case 'notIn': {
                const values = list(value);
                if (values.length) {
                    clauses.push(`${column} IS NULL OR ${column} NOT IN (:...${b.bind(values)})`);
                }
                break;
            }
            case 'isNull':
                clauses.push(
                    value === true
                        ? `coalesce(${column}, '') = ''`
                        : `coalesce(${column}, '') <> ''`,
                );
                break;
            case 'contains':
            case 'notContains': {
                if (exact) throw new UserInputError(`Unsupported filter operator: ${op}`);
                const param = b.bind(`%${escapeLike(text(value))}%`);
                const match =
                    field === 'managerErpId'
                        ? `(${column} ILIKE :${param} OR ${MANAGER_NAME_MATCH(param)})`
                        : `coalesce(${column}, '') ILIKE :${param}`;
                clauses.push(op === 'contains' ? match : `NOT ${match}`);
                break;
            }
        }
    }
    return clauses.map(c => `(${c})`);
}

function isPlainObject(value: unknown): boolean {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collect(filter: CounterpartyFilterParameter, b: Builder, depth: number): string[] {
    if (depth > 2) throw new UserInputError('Filter is nested too deeply');
    if (!isPlainObject(filter)) throw new UserInputError('Invalid filter');
    const unknown = Object.keys(filter).filter(k => !FIELDS.includes(k));
    if (unknown.length) throw new UserInputError(`Unknown filter field: ${unknown[0]}`);
    const clauses: string[] = [];
    for (const field of Object.keys(TEXT_COLUMNS) as TextField[]) {
        const ops = filter[field];
        if (ops != null && !isPlainObject(ops))
            throw new UserInputError(`Invalid operators for ${field}`);
        if (ops) clauses.push(...stringClause(field, ops, b));
    }
    if (filter.isActive && typeof filter.isActive.eq === 'boolean') {
        b.countCondition();
        clauses.push(`c."isActive" = :${b.bind(filter.isActive.eq)}`);
    }
    if (filter._and != null && !Array.isArray(filter._and))
        throw new UserInputError('Invalid _and');
    for (const nested of filter._and ?? []) clauses.push(...collect(nested, b, depth + 1));
    return clauses;
}

// Narrows on top of the access-scope restriction, never replaces it.
export function applyCounterpartyFilterParameter(
    qb: SelectQueryBuilder<Counterparty>,
    filter: CounterpartyFilterParameter | undefined,
): SelectQueryBuilder<Counterparty> {
    if (!filter) return qb;
    const builder = new Builder();
    const clauses = collect(filter, builder, 0);
    for (const clause of clauses) qb.andWhere(clause);
    qb.setParameters(builder.params);
    return qb;
}
