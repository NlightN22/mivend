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
