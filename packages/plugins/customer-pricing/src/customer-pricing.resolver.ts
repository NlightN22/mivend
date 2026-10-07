import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';

import { PriceType } from './entities/price-type.entity';
import { CustomerPricingService } from './customer-pricing.service';

@Resolver('Customer')
export class CustomerPricingResolver {
    constructor(private customerPricingService: CustomerPricingService) {}

    @ResolveField()
    async priceType(
        @Ctx() ctx: RequestContext,
        @Parent() customer: { id: string },
    ): Promise<PriceType | null> {
        return this.customerPricingService.getCustomerPriceType(ctx, customer.id);
    }
}

@Resolver('PriceType')
export class PriceTypeResolver {
    constructor(private customerPricingService: CustomerPricingService) {}

    @Query()
    @Allow(Permission.ReadCustomer)
    async priceTypes(@Ctx() ctx: RequestContext): Promise<PriceType[]> {
        return this.customerPricingService.findAllPriceTypes(ctx);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCustomer)
    async upsertPriceType(
        @Ctx() ctx: RequestContext,
        @Args() args: { code: string; name: string },
    ): Promise<PriceType> {
        return this.customerPricingService.upsertPriceType(ctx, args.code, args.name);
    }
}
