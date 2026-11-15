import type { SelectQueryBuilder } from 'typeorm';
import {
    applyListFilter,
    applyListSort,
    type FieldSpec,
    type ListFilter,
    type ListQueryConfig,
    type ListSort,
} from 'shared';

export interface PowerOfAttorneyListInput {
    skip?: number | null;
    take?: number | null;
    search?: string | null;
    filter?: ListFilter | null;
    sort?: ListSort | null;
}

const TEXT = ['contains', 'notContains', 'eq', 'notEq'] as const;

// The ERP sends the end date as midnight UTC of that day, and the power is valid through the whole day.
export const STATUS_SQL = `CASE WHEN "t"."validUntil" IS NOT NULL AND "t"."validUntil" + interval '1 day' <= now() THEN 'expired' ELSE 'active' END`;

const FIELDS: Record<string, FieldSpec> = {
    number: { kind: 'string', sql: '"t"."number"', operators: TEXT },
    holder: { kind: 'string', sql: '"t"."holderName"', operators: TEXT },
    validFrom: { kind: 'date', sql: '"t"."issueDate"' },
    validUntil: { kind: 'date', sql: '"t"."validUntil"' },
    status: { kind: 'string', sql: STATUS_SQL, operators: ['eq', 'notEq'] },
    contract: { kind: 'string', sql: '"ct"."name"', operators: TEXT },
    contractId: { kind: 'id', sql: '"ct"."id"' },
    customer: { kind: 'string', sql: '"cp"."shortName"', operators: TEXT },
    counterpartyId: { kind: 'id', sql: '"cp"."id"' },
    hasScan: { kind: 'boolean', sql: '("t"."scanId" IS NOT NULL)', operators: ['eq'] },
    contractDeleted: { kind: 'boolean', sql: '"t"."isDeleted"', operators: ['eq'] },
};

const CONFIG: ListQueryConfig = {
    fields: FIELDS,
    sortable: ['number', 'holder', 'validFrom', 'validUntil', 'customer'],
    paramPrefix: 'poaf',
    defaultSql: '"t"."validUntil"',
    tiebreakerSql: '"t"."id"',
    allowOr: false,
    limits: { maxConditions: 20, maxValues: 100, maxTextLength: 200 },
};

export function applyPowerOfAttorneyFilter(
    qb: SelectQueryBuilder<object>,
    filter: ListFilter | null | undefined,
): void {
    applyListFilter(CONFIG, qb, filter ?? undefined);
}

export function applyPowerOfAttorneySort(
    qb: SelectQueryBuilder<object>,
    sort: ListSort | null | undefined,
): void {
    applyListSort(CONFIG, qb, sort ?? undefined);
}
