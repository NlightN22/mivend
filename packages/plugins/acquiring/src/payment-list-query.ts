import type { SelectQueryBuilder } from 'typeorm';
import { normalizeDocumentNumber } from 'shared';

import type { PaymentAttempt } from './entities/payment-attempt.entity';
import {
    applyListFilter as applyFilter,
    applyListSort as applySort,
    type FieldSpec,
    type ListFilter,
    type ListQueryConfig,
    type ListSort,
} from './list-filter-engine';

export { likeTerm } from './list-filter-engine';

export type PaymentFilter = ListFilter;
export type PaymentSort = ListSort;

const P = '"payment"';
const PI = '"proformaInvoice"';

// The only fields a client may filter or sort by; the key is the GraphQL field name.
const FIELDS: Record<string, FieldSpec> = {
    number: { kind: 'string', sql: `${P}."number"`, normalize: normalizeDocumentNumber },
    createdAt: { kind: 'date', sql: `${P}."createdAt"` },
    amount: { kind: 'number', sql: `${P}."amount"` },
    status: { kind: 'string', sql: `${P}."paymentStatus"` },
    channel: { kind: 'string', sql: `${P}."channel"` },
    customer: { kind: 'string', sql: '"counterparty"."shortName"' },
    customerInn: { kind: 'string', sql: '"counterparty"."inn"' },
    counterpartyId: { kind: 'id', sql: `${PI}."counterpartyId"` },
    proformaInvoiceNumber: {
        kind: 'string',
        sql: `${PI}."number"`,
        normalize: normalizeDocumentNumber,
    },
    orderCode: {
        kind: 'string',
        sql: `(SELECT o."code" FROM "order" o WHERE o."id" = COALESCE(${P}."orderId", ${PI}."orderId"))`,
        normalize: normalizeDocumentNumber,
    },
};

const CONFIG: ListQueryConfig = {
    fields: FIELDS,
    sortable: ['number', 'createdAt', 'amount', 'status', 'channel', 'customer'],
    paramPrefix: 'payFilter',
    defaultSql: `${P}."createdAt"`,
    tiebreakerSql: `${P}."id"`,
};

export function applyListFilter(
    qb: SelectQueryBuilder<PaymentAttempt>,
    filter: PaymentFilter | undefined,
): void {
    applyFilter(CONFIG, qb, filter);
}

export function applyListSort(
    qb: SelectQueryBuilder<PaymentAttempt>,
    sort: PaymentSort | undefined,
): void {
    applySort(CONFIG, qb, sort);
}
