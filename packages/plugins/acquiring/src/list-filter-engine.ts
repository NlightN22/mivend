import { UserInputError } from '@vendure/core';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

type FieldKind = 'string' | 'number' | 'date' | 'id';
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
}

// One list's whitelist: `fields` is the only thing a client may filter by, `sortable` the only
// thing it may sort by; `defaultSql` and `tiebreakerSql` give the fixed fallback order.
export interface ListQueryConfig {
    fields: Record<string, FieldSpec>;
    sortable: readonly string[];
    paramPrefix: string;
    defaultSql: string;
    tiebreakerSql: string;
}

class ClauseBuilder {
    readonly params: Record<string, unknown> = {};
    private counter = 0;

    constructor(private readonly prefix: string) {}

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

function clauseFor(spec: FieldSpec, op: string, value: unknown, b: ClauseBuilder): string {
    const { sql } = spec;
    if (op === 'isNull') return value ? `${sql} IS NULL` : `${sql} IS NOT NULL`;
    const text = (v: unknown): string => (spec.normalize ? spec.normalize(String(v)) : String(v));
    switch (spec.kind) {
        case 'string':
            switch (op) {
                case 'eq':
                    return `${sql} = ${b.param(text(value))}`;
                case 'notEq':
                    return `(${sql} IS NULL OR ${sql} <> ${b.param(text(value))})`;
                case 'contains':
                    return `${sql} ILIKE ${b.param(likeTerm(text(value)))}`;
                case 'notContains':
                    return `(${sql} IS NULL OR ${sql} NOT ILIKE ${b.param(likeTerm(text(value)))})`;
                case 'in':
                    return `${sql} = ANY(${b.param((value as unknown[]).map(text))})`;
                case 'notIn':
                    return `(${sql} IS NULL OR NOT (${sql} = ANY(${b.param((value as unknown[]).map(text))})))`;
            }
            break;
        case 'id':
            switch (op) {
                case 'eq':
                    return `${sql} = ${b.param(numberValue(value))}`;
                case 'notEq':
                    return `${sql} <> ${b.param(numberValue(value))}`;
                case 'in':
                    return `${sql} = ANY(${b.param((value as unknown[]).map(numberValue))})`;
                case 'notIn':
                    return `NOT (${sql} = ANY(${b.param((value as unknown[]).map(numberValue))}))`;
            }
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
): string {
    if (depth > 4) throw new UserInputError('The filter is nested too deeply');
    const parts: string[] = [];
    for (const [field, operators] of Object.entries(filter)) {
        if (operators === undefined || operators === null) continue;
        if (field === '_and' || field === '_or') {
            const nested = (operators as ListFilter[])
                .map(f => groupSql(fields, f, b, depth + 1))
                .filter(Boolean);
            if (nested.length) parts.push(`(${nested.join(field === '_and' ? ' AND ' : ' OR ')})`);
            continue;
        }
        const spec = fields[field];
        if (!spec) throw new UserInputError(`Unknown filter field "${field}"`);
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
    const builder = new ClauseBuilder(config.paramPrefix);
    const sql = groupSql(config.fields, filter, builder, 0);
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
