import { UserInputError } from '@vendure/core';
import type { SelectQueryBuilder } from 'typeorm';
import { normalizeDocumentNumber } from 'shared';

import type { ProformaInvoice } from './entities/proforma-invoice.entity';

type FieldKind = 'string' | 'number' | 'date' | 'id';
type Operators = Record<string, unknown>;

export interface ProformaInvoiceFilter {
    [field: string]: unknown;
    _and?: ProformaInvoiceFilter[];
    _or?: ProformaInvoiceFilter[];
}
export type ProformaInvoiceSort = Partial<Record<string, 'ASC' | 'DESC'>>;

interface FieldSpec {
    kind: FieldKind;
    // Fixed SQL, never built from client input.
    sql: string;
    normalize?: (value: string) => string;
}

const PI = '"proformaInvoice"';
// Mirrors displayStatusOf: only cancelled and superseded are shown as such.
const DISPLAY_STATUS = `CASE WHEN ${PI}."status" IN ('cancelled', 'superseded') THEN ${PI}."status" ELSE 'current' END`;

// The only fields a client may filter or sort by; the key is the GraphQL field name.
const FIELDS: Record<string, FieldSpec> = {
    number: { kind: 'string', sql: `${PI}."number"`, normalize: normalizeDocumentNumber },
    createdAt: { kind: 'date', sql: `${PI}."createdAt"` },
    dueDate: { kind: 'date', sql: `${PI}."dueDate"` },
    amount: { kind: 'number', sql: `${PI}."amount"` },
    status: { kind: 'string', sql: DISPLAY_STATUS },
    customer: { kind: 'string', sql: '"counterparty"."shortName"' },
    customerInn: { kind: 'string', sql: '"counterparty"."inn"' },
    counterpartyId: { kind: 'id', sql: `${PI}."counterpartyId"` },
    orderCode: {
        kind: 'string',
        sql: `(SELECT o."code" FROM "order" o WHERE o."id" = ${PI}."orderId")`,
        normalize: normalizeDocumentNumber,
    },
};

const SORTABLE = ['number', 'createdAt', 'dueDate', 'amount', 'status', 'customer'] as const;

class ClauseBuilder {
    readonly params: Record<string, unknown> = {};
    private counter = 0;

    param(value: unknown): string {
        const name = `pfFilter${this.counter++}`;
        this.params[name] = value;
        return `:${name}`;
    }
}

function likeTerm(text: string): string {
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
                    return `${sql} <> ${b.param(text(value))}`;
                case 'contains':
                    return `${sql} ILIKE ${b.param(likeTerm(text(value)))}`;
                case 'notContains':
                    return `(${sql} IS NULL OR ${sql} NOT ILIKE ${b.param(likeTerm(text(value)))})`;
                case 'in':
                    return `${sql} = ANY(${b.param((value as unknown[]).map(text))})`;
                case 'notIn':
                    return `NOT (${sql} = ANY(${b.param((value as unknown[]).map(text))}))`;
                case 'regex':
                    return `${sql} ~* ${b.param(String(value))}`;
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
                after: '>=',
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

function groupSql(filter: ProformaInvoiceFilter, b: ClauseBuilder, depth: number): string {
    if (depth > 4) throw new UserInputError('The filter is nested too deeply');
    const parts: string[] = [];
    for (const [field, operators] of Object.entries(filter)) {
        if (operators === undefined || operators === null) continue;
        if (field === '_and' || field === '_or') {
            const nested = (operators as ProformaInvoiceFilter[])
                .map(f => groupSql(f, b, depth + 1))
                .filter(Boolean);
            if (nested.length) parts.push(`(${nested.join(field === '_and' ? ' AND ' : ' OR ')})`);
            continue;
        }
        const spec = FIELDS[field];
        if (!spec) throw new UserInputError(`Unknown filter field "${field}"`);
        for (const [op, value] of Object.entries(operators as Operators)) {
            if (value === undefined || value === null) continue;
            parts.push(clauseFor(spec, op, value, b));
        }
    }
    return parts.join(' AND ');
}

// Narrows an already scoped query; every value is a bound parameter.
export function applyListFilter(
    qb: SelectQueryBuilder<ProformaInvoice>,
    filter: ProformaInvoiceFilter | undefined,
): void {
    if (!filter) return;
    const builder = new ClauseBuilder();
    const sql = groupSql(filter, builder, 0);
    if (sql) qb.andWhere(sql, builder.params);
}

// Stable order: the chosen fields, then newest id first.
export function applyListSort(
    qb: SelectQueryBuilder<ProformaInvoice>,
    sort: ProformaInvoiceSort | undefined,
): void {
    let first = true;
    for (const [field, dir] of Object.entries(sort ?? {})) {
        if (!dir) continue;
        if (!(SORTABLE as readonly string[]).includes(field))
            throw new UserInputError(`Cannot sort by "${field}"`);
        const order = dir === 'ASC' ? 'ASC' : 'DESC';
        const sql = FIELDS[field].sql;
        if (first) qb.orderBy(sql, order, 'NULLS LAST');
        else qb.addOrderBy(sql, order, 'NULLS LAST');
        first = false;
    }
    if (first) qb.orderBy(`${PI}."createdAt"`, 'DESC');
    qb.addOrderBy(`${PI}."id"`, 'DESC');
}
