import { RequestContext } from '@vendure/core';
import { QueryTooLargeError } from 'shared';

import type { EntityFilterKind } from './order-analytics-entity-names.service';
import { OrderAnalyticsEntityNamesService } from './order-analytics-entity-names.service';
import { MAX_FILTER_VALUES } from './order-metrics.types';

export interface EntityNameFilter {
    kind: EntityFilterKind;
    values: string[];
    // Picked objects: each value is a whole name (case-insensitive), not a part of one.
    exact?: boolean;
}

const PER_VALUE_LIMIT = 200;
const MAX_VALUES_PER_KIND = 20;
export const SUGGEST_LIMIT = 10;

export interface ResolvedEntityFilters {
    customerIds: string[];
    organizationIds: string[];
    contractIds: string[];
    pointOfSaleIds: string[];
    managerIds: string[];
    counterpartyManagerIds: string[];
    productIds: string[];
    manufacturerIds: string[];
    // A filter whose names match nothing must give no rows, never the unfiltered answer.
    unmatched: boolean;
}

const FIELD_BY_KIND: Record<EntityFilterKind, keyof Omit<ResolvedEntityFilters, 'unmatched'>> = {
    CUSTOMER: 'customerIds',
    ORGANIZATION: 'organizationIds',
    CONTRACT: 'contractIds',
    POINT_OF_SALE: 'pointOfSaleIds',
    MANAGER: 'managerIds',
    COUNTERPARTY_MANAGER: 'counterpartyManagerIds',
    PRODUCT: 'productIds',
    MANUFACTURER: 'manufacturerIds',
};

export async function resolveEntityFilters(
    ctx: RequestContext,
    names: OrderAnalyticsEntityNamesService,
    filters: EntityNameFilter[],
): Promise<ResolvedEntityFilters> {
    const resolved: ResolvedEntityFilters = {
        customerIds: [],
        organizationIds: [],
        contractIds: [],
        pointOfSaleIds: [],
        managerIds: [],
        counterpartyManagerIds: [],
        productIds: [],
        manufacturerIds: [],
        unmatched: false,
    };
    for (const { kind, values, exact } of filters) {
        const wanted = values.map(v => v.trim()).filter(Boolean);
        if (wanted.length === 0) continue;
        // A cap is never a silent cut: a broad name fails closed instead of totalling a partial set.
        if (wanted.length > MAX_VALUES_PER_KIND) throw new QueryTooLargeError(MAX_VALUES_PER_KIND);
        const ids = new Set<string>();
        for (const value of wanted) {
            const found = await names.find(ctx, kind, value, PER_VALUE_LIMIT + 1, exact === true);
            if (found.length > PER_VALUE_LIMIT) throw new QueryTooLargeError(PER_VALUE_LIMIT);
            for (const entity of found) ids.add(entity.erpId);
        }
        if (ids.size > MAX_FILTER_VALUES) throw new QueryTooLargeError(MAX_FILTER_VALUES);
        if (ids.size === 0) resolved.unmatched = true;
        resolved[FIELD_BY_KIND[kind]].push(...ids);
    }
    return resolved;
}

export async function suggestEntityNames(
    ctx: RequestContext,
    names: OrderAnalyticsEntityNamesService,
    kind: EntityFilterKind,
    prefix: string,
): Promise<string[]> {
    if (prefix.trim().length < 2) return [];
    const found = await names.find(ctx, kind, prefix, SUGGEST_LIMIT * 3);
    return [...new Set(found.map(f => f.name))].slice(0, SUGGEST_LIMIT);
}
