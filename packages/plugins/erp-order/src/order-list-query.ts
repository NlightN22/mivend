import type { SelectQueryBuilder } from 'typeorm';
import type { Order } from '@vendure/core';
import {
    applyListFilter as applyFilter,
    applyListSort as applySort,
    normalizeDocumentNumber,
    type FieldSpec,
    type ListFilter,
    type ListQueryConfig,
    type ListSort,
} from 'shared';

export type OrderListFilter = ListFilter;
export type OrderListSort = ListSort;

export interface OrderListInput {
    skip?: number;
    take?: number;
    filter?: OrderListFilter;
    sort?: OrderListSort;
}

const O = '"order"';
const SELECT_OPERATORS = ['eq', 'notEq', 'in', 'notIn'] as const;

const select = (column: string): FieldSpec => ({
    kind: 'string',
    sql: `${O}."${column}"`,
    operators: SELECT_OPERATORS,
});

// The only fields a client may filter or sort by; the key is the GraphQL field name.
const FIELDS: Record<string, FieldSpec> = {
    code: {
        kind: 'string',
        sql: `${O}."code"`,
        normalize: normalizeDocumentNumber,
        operators: ['eq', 'notEq', 'contains', 'notContains'],
    },
    createdAt: { kind: 'date', sql: `${O}."createdAt"` },
    orderPlacedAt: { kind: 'date', sql: `${O}."orderPlacedAt"` },
    state: select('state'),
    totalWithTax: {
        kind: 'number',
        sql: `(${O}."subTotalWithTax" + COALESCE(${O}."shippingWithTax", 0))`,
    },
    placedByAdministratorId: select('customFieldsPlacedbyadministratorid'),
    reservationState: select('customFieldsReservationstate'),
    reservationFailureReason: select('customFieldsReservationfailurereason'),
    erpStatus: select('customFieldsErpstatus'),
    hasCheckFindings: {
        kind: 'boolean',
        sql: `${O}."customFieldsHascheckfindings"`,
        operators: ['eq'],
    },
};

const CONFIG: ListQueryConfig = {
    fields: FIELDS,
    sortable: ['code', 'state', 'totalWithTax', 'orderPlacedAt', 'createdAt'],
    paramPrefix: 'olf',
    defaultSql: `${O}."createdAt"`,
    tiebreakerSql: `${O}."id"`,
    allowOr: false,
    limits: { maxConditions: 20, maxValues: 100, maxTextLength: 200 },
};

export function applyOrderListFilter(
    qb: SelectQueryBuilder<Order>,
    filter: OrderListFilter | undefined,
): void {
    applyFilter(CONFIG, qb, filter);
}

export function applyOrderListSort(
    qb: SelectQueryBuilder<Order>,
    sort: OrderListSort | undefined,
): void {
    applySort(CONFIG, qb, sort);
}
