import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import type { ProductVariant } from '@vendure/core';

@Resolver('ProductVariant')
export class ProductVariantAvailabilityResolver {
    @ResolveField()
    availableForOrder(@Parent() variant: ProductVariant): boolean {
        return variant.customFields?.organizationId != null;
    }
}
