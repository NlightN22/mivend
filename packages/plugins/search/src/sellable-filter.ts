import type { ProductVariant } from '@vendure/core';

export const HAS_ORGANIZATION_FIELD = 'variant-hasOrganization';

export const hasOrganizationMapping = {
    graphQlType: 'Boolean!' as const,
    public: false,
    valueFn: (variant: ProductVariant): boolean =>
        (variant.customFields as Record<string, unknown> | undefined)?.organizationId != null,
};

interface BoolQuery {
    bool: { filter: unknown[] };
}

// A variant without an organization (seller of record) cannot be ordered, so the shop view hides it.
export function restrictToSellable<T extends BoolQuery>(query: T, enabledOnly: boolean): T {
    if (enabledOnly) query.bool.filter.push({ term: { [HAS_ORGANIZATION_FIELD]: true } });
    return query;
}

// A product in a hidden category is invisible to customers; staff searches pass no ids. A filter
// clause, because the code-match modes overwrite `must_not`.
export function excludeHiddenCategories<T extends BoolQuery>(query: T, hiddenIds?: string[]): T {
    if (hiddenIds && hiddenIds.length > 0) {
        query.bool.filter.push({ bool: { must_not: [{ terms: { facetValueIds: hiddenIds } }] } });
    }
    return query;
}
