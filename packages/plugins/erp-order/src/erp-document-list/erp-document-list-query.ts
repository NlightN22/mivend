import type { SelectQueryBuilder } from 'typeorm';
import {
    applyListFilter as applyFilter,
    applyListSort as applySort,
    normalizeDocumentNumber,
    type FieldSpec,
    type ListFilter,
    type ListQueryConfig,
    type ListSort,
} from 'shared';

import { ERP_DOCUMENT_KINDS, type ErpDocumentKind } from './erp-document-kinds';

export interface ErpDocumentListInput {
    skip?: number | null;
    take?: number | null;
    search?: string | null;
    filter?: ListFilter | null;
    sort?: ListSort | null;
}

const TEXT = ['contains', 'notContains', 'eq', 'notEq'] as const;

const FIELDS: Record<string, FieldSpec> = {
    number: { kind: 'string', sql: '"t"."number"', operators: TEXT },
    date: { kind: 'date', sql: '"t"."date"' },
    amount: { kind: 'number', sql: '"t"."totalAmountMinor"' },
    customer: { kind: 'string', sql: '"cp"."shortName"', operators: TEXT },
    customerInn: { kind: 'string', sql: '"cp"."inn"', operators: TEXT },
    counterpartyId: { kind: 'id', sql: '"cp"."id"' },
    orderCode: {
        kind: 'string',
        sql: '"o"."code"',
        normalize: normalizeDocumentNumber,
        operators: TEXT,
    },
    orderId: { kind: 'id', sql: '"o"."id"' },
    organization: { kind: 'string', sql: '"org"."legalName"', operators: TEXT },
    contract: { kind: 'string', sql: '"ct"."name"', operators: TEXT },
    comment: { kind: 'string', sql: '"t"."comment"', operators: TEXT },
};

function configFor(kind: ErpDocumentKind): ListQueryConfig {
    const fields = { ...FIELDS };
    if (!ERP_DOCUMENT_KINDS[kind].hasContract) delete fields.contract;
    return {
        fields,
        sortable: ['number', 'date', 'amount', 'customer'],
        paramPrefix: 'edf',
        defaultSql: '"t"."date"',
        tiebreakerSql: '"t"."id"',
        allowOr: false,
        limits: { maxConditions: 20, maxValues: 100, maxTextLength: 200 },
    };
}

export function applyErpDocumentFilter(
    kind: ErpDocumentKind,
    qb: SelectQueryBuilder<object>,
    filter: ListFilter | null | undefined,
): void {
    applyFilter(configFor(kind), qb, filter ?? undefined);
}

export function applyErpDocumentSort(
    kind: ErpDocumentKind,
    qb: SelectQueryBuilder<object>,
    sort: ListSort | null | undefined,
): void {
    applySort(configFor(kind), qb, sort ?? undefined);
}
