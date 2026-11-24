import { RequestContext } from '@vendure/core';

import type { EntityFilterKind } from './order-analytics-entity-names.service';
import { OrderAnalyticsEntityNamesService } from './order-analytics-entity-names.service';
import { MAX_FILTER_VALUES } from './order-metrics.types';

export interface EntityNameFilter {
    kind: EntityFilterKind;
    values: string[];
}

const PER_VALUE_LIMIT = 200;
const MAX_VALUES_PER_KIND = 20;
export const SUGGEST_LIMIT = 10;

export interface ResolvedEntityFilters {
    customerIds: string[];
    organizationIds: string[];
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
        pointOfSaleIds: [],
        managerIds: [],
        counterpartyManagerIds: [],
        productIds: [],
        manufacturerIds: [],
        unmatched: false,
    };
    for (const { kind, values } of filters) {
        const wanted = values.map(v => v.trim()).filter(Boolean);
        if (wanted.length === 0) continue;
        const ids = new Set<string>();
        for (const value of wanted.slice(0, MAX_VALUES_PER_KIND)) {
            for (const found of await names.find(ctx, kind, value, PER_VALUE_LIMIT)) {
                ids.add(found.erpId);
            }
        }
        if (ids.size === 0) resolved.unmatched = true;
        const target = resolved[FIELD_BY_KIND[kind]];
        for (const id of ids) if (target.length < MAX_FILTER_VALUES) target.push(id);
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
