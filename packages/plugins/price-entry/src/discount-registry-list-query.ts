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

import type { DiscountRegistryEntry } from './discount-registry-entry.entity';

export type DiscountRegistryFilter = ListFilter;
export type DiscountRegistrySort = ListSort;

// 14 days is a placeholder; the threshold is not decided yet (see manager-portal-concept.md §8.2).
export const EXPIRING_SOON_DAYS = 14;

const E = '"entry"';

// active / expiring-soon / expired are derived from validTo at query time; pending / rejected are stored.
export const REGISTRY_STATUS_SQL = `(CASE WHEN ${E}."status" <> 'materialized' THEN ${E}."status"
    WHEN ${E}."validTo" < LOCALTIMESTAMP THEN 'expired'
    WHEN ${E}."validTo" < LOCALTIMESTAMP + INTERVAL '${EXPIRING_SOON_DAYS} days' THEN 'expiring-soon'
    ELSE 'active' END)`;

// The only fields a client may filter or sort by; the key is the GraphQL field name.
const FIELDS: Record<string, FieldSpec> = {
    number: { kind: 'string', sql: `${E}."number"`, normalize: normalizeDocumentNumber },
    createdAt: { kind: 'date', sql: `${E}."createdAt"` },
    customer: { kind: 'string', sql: `${E}."customerNamesForSearch"` },
    priceType: { kind: 'string', sql: `${E}."priceTypeCode"` },
    productGroup: { kind: 'string', sql: `${E}."facetValueCode"` },
    percent: { kind: 'number', sql: `${E}."percent"` },
    validFrom: { kind: 'date', sql: `${E}."validFrom"` },
    validTo: { kind: 'date', sql: `${E}."validTo"` },
    status: { kind: 'string', sql: REGISTRY_STATUS_SQL },
};

const CONFIG: ListQueryConfig = {
    fields: FIELDS,
    sortable: [
        'number',
        'createdAt',
        'customer',
        'priceType',
        'productGroup',
        'percent',
        'validFrom',
        'validTo',
        'status',
    ],
    paramPrefix: 'discFilter',
    defaultSql: `${E}."createdAt"`,
    tiebreakerSql: `${E}."id"`,
    allowOr: false,
    limits: { maxConditions: 20, maxValues: 100, maxTextLength: 200 },
};

export function applyListFilter(
    qb: SelectQueryBuilder<DiscountRegistryEntry>,
    filter: DiscountRegistryFilter | undefined,
): void {
    applyFilter(CONFIG, qb, filter);
}

export function applyListSort(
    qb: SelectQueryBuilder<DiscountRegistryEntry>,
    sort: DiscountRegistrySort | undefined,
): void {
    applySort(CONFIG, qb, sort);
}
