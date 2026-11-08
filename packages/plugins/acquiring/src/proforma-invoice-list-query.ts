import type { SelectQueryBuilder } from 'typeorm';

import type { ProformaInvoice } from './entities/proforma-invoice.entity';
import {
    applyListFilter as applyFilter,
    applyListSort as applySort,
    type FieldSpec,
    type ListFilter,
    type ListQueryConfig,
    type ListSort,
    normalizeDocumentNumber,
} from 'shared';

export { likeTerm } from 'shared';

export type ProformaInvoiceFilter = ListFilter;
export type ProformaInvoiceSort = ListSort;

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

const CONFIG: ListQueryConfig = {
    fields: FIELDS,
    sortable: ['number', 'createdAt', 'dueDate', 'amount', 'status', 'customer'],
    paramPrefix: 'pfFilter',
    defaultSql: `${PI}."createdAt"`,
    tiebreakerSql: `${PI}."id"`,
};

export function applyListFilter(
    qb: SelectQueryBuilder<ProformaInvoice>,
    filter: ProformaInvoiceFilter | undefined,
): void {
    applyFilter(CONFIG, qb, filter);
}

export function applyListSort(
    qb: SelectQueryBuilder<ProformaInvoice>,
    sort: ProformaInvoiceSort | undefined,
): void {
    applySort(CONFIG, qb, sort);
}
