import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';
import { CustomerPricingService, PriceType } from '@mivend/plugin-customer-pricing';

import { PriceTypeAccessService } from './price-type-access.service';

// Lives here, not in plugin-customer-pricing: that package cannot depend on the access service
// (access-control already depends on it).
@Resolver()
export class PriceTypeAdminResolver {
    constructor(
        private customerPricingService: CustomerPricingService,
        private priceTypeAccess: PriceTypeAccessService,
    ) {}

    @Query()
    @Allow(Permission.ReadCustomer)
    async priceTypes(@Ctx() ctx: RequestContext): Promise<PriceType[]> {
        const allowed = new Set(await this.priceTypeAccess.allowedCodes(ctx));
        return (await this.customerPricingService.findAllPriceTypes(ctx)).filter(t =>
            allowed.has(t.code),
        );
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCustomer)
    async upsertPriceType(
        @Ctx() ctx: RequestContext,
        @Args() args: { code: string; name: string },
    ): Promise<PriceType> {
        const existing = await this.customerPricingService.findPriceTypeByCode(ctx, args.code);
        if (existing) await this.priceTypeAccess.assertCodeAllowed(ctx, args.code);
        return this.customerPricingService.upsertPriceType(ctx, args.code, args.name);
    }
}

@Resolver('Customer')
export class CustomerPriceTypeResolver {
    constructor(
        private customerPricingService: CustomerPricingService,
        private priceTypeAccess: PriceTypeAccessService,
    ) {}

    // The customer's own type is shown in its context while it is a customer type; confidential never.
    @ResolveField()
    async priceType(
        @Ctx() ctx: RequestContext,
        @Parent() customer: { id: string },
    ): Promise<PriceType | null> {
        const own = await this.customerPricingService.getCustomerPriceType(ctx, customer.id);
        if (!own) return null;
        return (await this.priceTypeAccess.isCodeAllowed(ctx, own.code, {
            contextCodes: [own.code],
        }))
            ? own
            : null;
    }
}
