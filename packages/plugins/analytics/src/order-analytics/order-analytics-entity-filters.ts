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
    // Leaves the picked objects out; always whole-name, and names that match nothing exclude nothing.
    exclude?: boolean;
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
    excludeCustomerIds: string[];
    excludeOrganizationIds: string[];
    excludeContractIds: string[];
    excludePointOfSaleIds: string[];
    excludeManagerIds: string[];
    excludeCounterpartyManagerIds: string[];
    excludeProductIds: string[];
    excludeManufacturerIds: string[];
    // A filter whose names match nothing must give no rows, never the unfiltered answer.
    unmatched: boolean;
}

type IdField = keyof Omit<ResolvedEntityFilters, 'unmatched'>;

const FIELD_BY_KIND: Record<EntityFilterKind, [include: IdField, exclude: IdField]> = {
    CUSTOMER: ['customerIds', 'excludeCustomerIds'],
    ORGANIZATION: ['organizationIds', 'excludeOrganizationIds'],
    CONTRACT: ['contractIds', 'excludeContractIds'],
    POINT_OF_SALE: ['pointOfSaleIds', 'excludePointOfSaleIds'],
    MANAGER: ['managerIds', 'excludeManagerIds'],
    COUNTERPARTY_MANAGER: ['counterpartyManagerIds', 'excludeCounterpartyManagerIds'],
    PRODUCT: ['productIds', 'excludeProductIds'],
    MANUFACTURER: ['manufacturerIds', 'excludeManufacturerIds'],
};

export const emptyResolvedEntityFilters = (): ResolvedEntityFilters => ({
    customerIds: [],
    organizationIds: [],
    contractIds: [],
    pointOfSaleIds: [],
    managerIds: [],
    counterpartyManagerIds: [],
    productIds: [],
    manufacturerIds: [],
    excludeCustomerIds: [],
    excludeOrganizationIds: [],
    excludeContractIds: [],
    excludePointOfSaleIds: [],
    excludeManagerIds: [],
    excludeCounterpartyManagerIds: [],
    excludeProductIds: [],
    excludeManufacturerIds: [],
    unmatched: false,
});

export async function resolveEntityFilters(
    ctx: RequestContext,
    names: OrderAnalyticsEntityNamesService,
    filters: EntityNameFilter[],
): Promise<ResolvedEntityFilters> {
    const resolved = emptyResolvedEntityFilters();
    for (const { kind, values, exact, exclude } of filters) {
        const wanted = values.map(v => v.trim()).filter(Boolean);
        if (wanted.length === 0) continue;
        // A cap is never a silent cut: a broad name fails closed instead of totalling a partial set.
        if (wanted.length > MAX_VALUES_PER_KIND) throw new QueryTooLargeError(MAX_VALUES_PER_KIND);
        const ids = new Set<string>();
        for (const value of wanted) {
            const found = await names.find(
                ctx,
                kind,
                value,
                PER_VALUE_LIMIT + 1,
                exact === true || exclude === true,
            );
            if (found.length > PER_VALUE_LIMIT) throw new QueryTooLargeError(PER_VALUE_LIMIT);
            for (const entity of found) ids.add(entity.erpId);
        }
        if (ids.size > MAX_FILTER_VALUES) throw new QueryTooLargeError(MAX_FILTER_VALUES);
        const [include, excluded] = FIELD_BY_KIND[kind];
        if (exclude) resolved[excluded].push(...ids);
        else {
            if (ids.size === 0) resolved.unmatched = true;
            resolved[include].push(...ids);
        }
    }
    for (const field of Object.keys(resolved) as Array<keyof ResolvedEntityFilters>) {
        const list = resolved[field];
        if (Array.isArray(list) && list.length > MAX_FILTER_VALUES) {
            throw new QueryTooLargeError(MAX_FILTER_VALUES);
        }
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
