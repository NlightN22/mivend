import { RequestContext, UserInputError } from '@vendure/core';
import { QueryTooLargeError } from 'shared';

import type { OrderAnalyticsGroupsService } from './order-analytics-groups.service';
import { MAX_FILTER_VALUES } from './order-metrics.types';

export const GROUP_KINDS = ['MANUFACTURER_GROUP', 'PRODUCT_CATEGORY', 'CUSTOMER_GROUP'] as const;
export type GroupFilterKind = (typeof GROUP_KINDS)[number];

// The analytics service has not deployed these two yet; they stay behind one switch.
export const DEFERRED_GROUP_KINDS: GroupFilterKind[] = ['PRODUCT_CATEGORY', 'CUSTOMER_GROUP'];

// Our own entity ids as picked in the group lookup; the group is expanded by the analytics service.
export interface GroupFilter {
    kind: GroupFilterKind;
    ids: string[];
    exclude?: boolean;
}

export interface ResolvedGroupFilters {
    manufacturerGroupIds: string[];
    excludeManufacturerGroupIds: string[];
    productCategoryIds: string[];
    excludeProductCategoryIds: string[];
    customerGroupIds: string[];
    excludeCustomerGroupIds: string[];
    // An include group that resolves to nothing selects no rows, never the unfiltered answer.
    unmatched: boolean;
}

type Field = keyof Omit<ResolvedGroupFilters, 'unmatched'>;

const FIELDS: Record<GroupFilterKind, [include: Field, exclude: Field]> = {
    MANUFACTURER_GROUP: ['manufacturerGroupIds', 'excludeManufacturerGroupIds'],
    PRODUCT_CATEGORY: ['productCategoryIds', 'excludeProductCategoryIds'],
    CUSTOMER_GROUP: ['customerGroupIds', 'excludeCustomerGroupIds'],
};

export const emptyResolvedGroupFilters = (): ResolvedGroupFilters => ({
    manufacturerGroupIds: [],
    excludeManufacturerGroupIds: [],
    productCategoryIds: [],
    excludeProductCategoryIds: [],
    customerGroupIds: [],
    excludeCustomerGroupIds: [],
    unmatched: false,
});

export async function resolveGroupFilters(
    ctx: RequestContext,
    groups: OrderAnalyticsGroupsService,
    filters: GroupFilter[],
    deferredEnabled: boolean,
    allowed: GroupFilterKind[],
): Promise<ResolvedGroupFilters> {
    const resolved = emptyResolvedGroupFilters();
    for (const { kind, ids, exclude } of filters) {
        if (!allowed.includes(kind))
            throw new UserInputError('This report cannot filter by that group');
        if (DEFERRED_GROUP_KINDS.includes(kind) && !deferredEnabled) {
            throw new UserInputError('This group filter is not available');
        }
        const wanted = [...new Set(ids)];
        if (wanted.length === 0) continue;
        if (wanted.length > MAX_FILTER_VALUES) throw new QueryTooLargeError(MAX_FILTER_VALUES);
        const erpIds = await groups.erpIds(ctx, kind, wanted);
        const [include, excluded] = FIELDS[kind];
        if (exclude) resolved[excluded].push(...erpIds);
        else {
            if (erpIds.length === 0) resolved.unmatched = true;
            resolved[include].push(...erpIds);
        }
    }
    for (const field of Object.values(FIELDS).flat()) {
        if (resolved[field].length > MAX_FILTER_VALUES)
            throw new QueryTooLargeError(MAX_FILTER_VALUES);
    }
    return resolved;
}
