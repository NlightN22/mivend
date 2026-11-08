import type { SelectQueryBuilder } from 'typeorm';
import {
    applyListFilter as applyFilter,
    applyListSort as applySort,
    type FieldSpec,
    type ListFilter,
    type ListQueryConfig,
    type ListSort,
} from 'shared';

import type { SettlementDocumentEntry } from './entities/settlement-document-entry.entity';

export type SettlementListFilter = ListFilter;
export type SettlementListSort = ListSort;

const D = '"d"';
const E = '"e"';
export const TYPE_LABEL_SQL = `COALESCE("t"."label", ${D}."documentTypeLabel")`;
export const CATEGORY_LIST_SQL = `COALESCE("t"."category", 'other')`;
export const FIRST_ORDER_CODE_SQL = `(SELECT o."code" FROM "settlement_order_link" l
    JOIN "order" o ON o."id" = l."orderId" AND o."customFieldsCounterpartyid" = ${E}."counterpartyId"
    WHERE l."entryId" = ${E}."id" ORDER BY l."id" LIMIT 1)`;
// Raw read of the acquiring plugin's table (no plugin dependency); the server always loads both.
export const PROFORMA_NUMBER_SQL = `(SELECT p."number" FROM "proforma_invoice" p
    WHERE p."salesInvoiceNumber" = ${D}."number" AND p."counterpartyId"::text = ${E}."counterpartyId"
    ORDER BY p."id" DESC LIMIT 1)`;

// The only fields a client may filter or sort by; the key is the GraphQL field name.
const FIELDS: Record<string, FieldSpec> = {
    documentType: { kind: 'string', sql: `${D}."documentType"` },
    typeLabel: { kind: 'string', sql: TYPE_LABEL_SQL },
    number: { kind: 'string', sql: `${D}."number"` },
    date: { kind: 'date', sql: `${D}."date"` },
    amount: { kind: 'number', sql: `${E}."amountMinor"` },
    customer: { kind: 'string', sql: '"counterparty"."shortName"' },
    customerInn: { kind: 'string', sql: '"counterparty"."inn"' },
    counterpartyId: { kind: 'id', sql: '"counterparty"."id"' },
    contract: { kind: 'string', sql: '"contract"."name"' },
    contractId: { kind: 'string', sql: `${E}."contractId"` },
    organization: { kind: 'string', sql: '"org"."legalName"' },
    organizationId: { kind: 'string', sql: `${E}."organizationErpId"` },
    orderCode: { kind: 'string', sql: FIRST_ORDER_CODE_SQL },
    proformaInvoiceNumber: { kind: 'string', sql: PROFORMA_NUMBER_SQL },
};

const CONFIG: ListQueryConfig = {
    fields: FIELDS,
    sortable: ['typeLabel', 'number', 'date', 'amount', 'customer'],
    paramPrefix: 'setFilter',
    defaultSql: `${D}."date"`,
    tiebreakerSql: `${E}."id"`,
};

export function applyListFilter(
    qb: SelectQueryBuilder<SettlementDocumentEntry>,
    filter: SettlementListFilter | undefined,
): void {
    applyFilter(CONFIG, qb, filter);
}

export function applyListSort(
    qb: SelectQueryBuilder<SettlementDocumentEntry>,
    sort: SettlementListSort | undefined,
): void {
    applySort(CONFIG, qb, sort);
}
