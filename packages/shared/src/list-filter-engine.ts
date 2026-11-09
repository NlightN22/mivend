import { UserInputError } from '@vendure/core';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

type FieldKind = 'string' | 'number' | 'date' | 'id' | 'boolean';
type Operators = Record<string, unknown>;

export interface ListFilter {
    [field: string]: unknown;
    _and?: ListFilter[];
    _or?: ListFilter[];
}
export type ListSort = Partial<Record<string, 'ASC' | 'DESC'>>;

// A negative take would fail in SQL and a huge one is unbounded; 0 stays a count-only request.
export const MAX_TAKE = 200;
export function clampTake(take: number | undefined): number {
    return Math.min(Math.max(take ?? 50, 0), MAX_TAKE);
}

export function clampSkip(skip: number | undefined): number {
    return Math.max(Math.trunc(skip ?? 0), 0);
}

export interface FieldSpec {
    kind: FieldKind;
    // Fixed SQL, never built from client input.
    sql: string;
    normalize?: (value: string) => string;
    // Restricts the operators a client may use on this field (isNull is always allowed).
    operators?: readonly string[];
    // Extra fixed SQL matched by contains/notContains alongside `sql` (e.g. a related name).
    containsAlsoSql?: string;
}

// Optional caps for lists that take untrusted nested filters; absent means no cap.
export interface ListFilterLimits {
    maxConditions?: number;
    maxValues?: number;
    maxTextLength?: number;
}

// One list's whitelist: `fields` is the only thing a client may filter by, `sortable` the only
// thing it may sort by; `defaultSql` and `tiebreakerSql` give the fixed fallback order.
export interface ListQueryConfig {
    fields: Record<string, FieldSpec>;
    sortable: readonly string[];
    paramPrefix: string;
    defaultSql: string;
    tiebreakerSql: string;
    limits?: ListFilterLimits;
    allowOr?: boolean;
}

class ClauseBuilder {
    readonly params: Record<string, unknown> = {};
    private counter = 0;
    private conditions = 0;

    constructor(
        private readonly prefix: string,
        readonly limits: ListFilterLimits = {},
    ) {}

    countCondition(): void {
        this.conditions += 1;
        if (
            this.limits.maxConditions !== undefined &&
            this.conditions > this.limits.maxConditions
        ) {
            throw new UserInputError(`At most ${this.limits.maxConditions} filter conditions`);
        }
    }

    param(value: unknown): string {
        const name = `${this.prefix}${this.counter++}`;
        this.params[name] = value;
        return `:${name}`;
    }
}

export function likeTerm(text: string): string {
    return `%${text.replace(/[\\%_]/g, '\\$&')}%`;
}

function dateValue(value: unknown): Date {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new UserInputError('Invalid date in the filter');
    return date;
}

function numberValue(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new UserInputError('Invalid number in the filter');
    return n;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function listValue(value: unknown, b: ClauseBuilder): unknown[] {
    const max = b.limits.maxValues;
    if (!Array.isArray(value) || (max !== undefined && value.length > max)) {
        throw new UserInputError(
            max === undefined ? 'Invalid filter value' : `At most ${max} values per filter`,
        );
    }
    return value;
}

function clauseFor(spec: FieldSpec, op: string, value: unknown, b: ClauseBuilder): string {
    const { sql } = spec;
    b.countCondition();
    if (op !== 'isNull' && spec.operators && !spec.operators.includes(op)) {
        throw new UserInputError(`Unsupported filter operator "${op}"`);
    }
    if (op === 'isNull') return value ? `${sql} IS NULL` : `${sql} IS NOT NULL`;
    const maxText = b.limits.maxTextLength;
    const text = (v: unknown): string => {
        if (maxText !== undefined && (typeof v !== 'string' || v.length > maxText)) {
            throw new UserInputError('Invalid filter value');
        }
        return spec.normalize ? spec.normalize(String(v)) : String(v);
    };
    const many = (): unknown[] => listValue(value, b);
    switch (spec.kind) {
        case 'string':
            switch (op) {
                case 'eq':
                    return `${sql} = ${b.param(text(value))}`;
                case 'notEq':
                    return `(${sql} IS NULL OR ${sql} <> ${b.param(text(value))})`;
                case 'contains':
                case 'notContains': {
                    const p = b.param(likeTerm(text(value)));
                    const also = spec.containsAlsoSql;
                    if (!also) {
                        return op === 'contains'
                            ? `${sql} ILIKE ${p}`
                            : `(${sql} IS NULL OR ${sql} NOT ILIKE ${p})`;
                    }
                    const hit = `(coalesce(${sql} ILIKE ${p}, false) OR coalesce(${also} ILIKE ${p}, false))`;
                    return op === 'contains' ? hit : `NOT ${hit}`;
                }
                case 'in':
                    return `${sql} = ANY(${b.param(many().map(text))})`;
                case 'notIn':
                    return `(${sql} IS NULL OR NOT (${sql} = ANY(${b.param(many().map(text))})))`;
            }
            break;
        case 'id':
            switch (op) {
                case 'eq':
                    return `${sql} = ${b.param(numberValue(value))}`;
                case 'notEq':
                    return `${sql} <> ${b.param(numberValue(value))}`;
                case 'in':
                    return `${sql} = ANY(${b.param(many().map(numberValue))})`;
                case 'notIn':
                    return `NOT (${sql} = ANY(${b.param(many().map(numberValue))}))`;
            }
            break;
        case 'boolean':
            if (op === 'eq' && typeof value === 'boolean') return `${sql} = ${b.param(value)}`;
            break;
        case 'number':
        case 'date': {
            const conv = spec.kind === 'number' ? numberValue : dateValue;
            const cmp: Record<string, string> = {
                eq: '=',
                gt: '>',
                gte: '>=',
                lt: '<',
                lte: '<=',
                before: '<',
                after: '>',
            };
            if (op === 'between') {
                const range = value as { start: unknown; end: unknown };
                const end = spec.kind === 'date' ? '<' : '<=';
                return `(${sql} >= ${b.param(conv(range.start))} AND ${sql} ${end} ${b.param(conv(range.end))})`;
            }
            if (cmp[op]) return `${sql} ${cmp[op]} ${b.param(conv(value))}`;
        }
    }
    throw new UserInputError(`Unsupported filter operator "${op}"`);
}

function groupSql(
    fields: Record<string, FieldSpec>,
    filter: ListFilter,
    b: ClauseBuilder,
    depth: number,
    allowOr: boolean,
): string {
    if (depth > 4) throw new UserInputError('The filter is nested too deeply');
    if (!isPlainObject(filter)) throw new UserInputError('Invalid filter');
    const parts: string[] = [];
    for (const [field, operators] of Object.entries(filter)) {
        if (operators === undefined || operators === null) continue;
        if (field === '_and' || field === '_or') {
            if (field === '_or' && !allowOr) throw new UserInputError('Unsupported filter "_or"');
            if (!Array.isArray(operators)) throw new UserInputError(`Invalid ${field}`);
            const nested = (operators as ListFilter[])
                .map(f => groupSql(fields, f, b, depth + 1, allowOr))
                .filter(Boolean);
            if (nested.length) parts.push(`(${nested.join(field === '_and' ? ' AND ' : ' OR ')})`);
            continue;
        }
        const spec = fields[field];
        if (!spec) throw new UserInputError(`Unknown filter field "${field}"`);
        if (!isPlainObject(operators)) throw new UserInputError(`Invalid operators for ${field}`);
        for (const [op, value] of Object.entries(operators as Operators)) {
            if (value === undefined || value === null) continue;
            parts.push(clauseFor(spec, op, value, b));
        }
    }
    return parts.join(' AND ');
}

// Narrows an already scoped query; every value is a bound parameter.
export function applyListFilter<E extends ObjectLiteral>(
    config: ListQueryConfig,
    qb: SelectQueryBuilder<E>,
    filter: ListFilter | undefined,
): void {
    if (!filter) return;
    const builder = new ClauseBuilder(config.paramPrefix, config.limits);
    const sql = groupSql(config.fields, filter, builder, 0, config.allowOr ?? true);
    if (sql) qb.andWhere(sql, builder.params);
}

// Stable order: the chosen fields, then newest id first.
export function applyListSort<E extends ObjectLiteral>(
    config: ListQueryConfig,
    qb: SelectQueryBuilder<E>,
    sort: ListSort | undefined,
): void {
    let first = true;
    for (const [field, dir] of Object.entries(sort ?? {})) {
        if (!dir) continue;
        if (!config.sortable.includes(field)) throw new UserInputError(`Cannot sort by "${field}"`);
        const order = dir === 'ASC' ? 'ASC' : 'DESC';
        const sql = config.fields[field].sql;
        if (first) qb.orderBy(sql, order, 'NULLS LAST');
        else qb.addOrderBy(sql, order, 'NULLS LAST');
        first = false;
    }
    if (first) qb.orderBy(config.defaultSql, 'DESC');
    qb.addOrderBy(config.tiebreakerSql, 'DESC');
}
