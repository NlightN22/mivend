import { UserInputError } from '@vendure/core';
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
};

const MAX_CONDITIONS = 20;
const MAX_VALUES = 100;
const MAX_TEXT_LENGTH = 200;

// Interim copy of the engine's limits/allowOr config (counterparty list); switch to it once the engine has it.
function assertWithinLimits(filter: ListFilter): void {
    let conditions = 0;
    let values = 0;
    const walk = (node: ListFilter): void => {
        if (node._or) throw new UserInputError('Unsupported filter "_or"');
        for (const nested of node._and ?? []) walk(nested);
        for (const [field, operators] of Object.entries(node)) {
            if (field === '_and' || !operators || typeof operators !== 'object') continue;
            for (const value of Object.values(operators as Record<string, unknown>)) {
                conditions++;
                const list = Array.isArray(value) ? value : [value];
                values += list.length;
                if (list.some(v => typeof v === 'string' && v.length > MAX_TEXT_LENGTH))
                    throw new UserInputError(`A filter value is longer than ${MAX_TEXT_LENGTH}`);
            }
        }
    };
    walk(filter);
    if (conditions > MAX_CONDITIONS)
        throw new UserInputError(`At most ${MAX_CONDITIONS} filter conditions`);
    if (values > MAX_VALUES) throw new UserInputError(`At most ${MAX_VALUES} filter values`);
}

export function applyListFilter(
    qb: SelectQueryBuilder<DiscountRegistryEntry>,
    filter: DiscountRegistryFilter | undefined,
): void {
    if (filter) assertWithinLimits(filter);
    applyFilter(CONFIG, qb, filter);
}

export function applyListSort(
    qb: SelectQueryBuilder<DiscountRegistryEntry>,
    sort: DiscountRegistrySort | undefined,
): void {
    applySort(CONFIG, qb, sort);
}
