import { Args, Mutation, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';

import { ProductVariantPriceEntry } from './price-entry.entity';
import { PriceEntryInput, PriceEntryService } from './price-entry.service';
import { DiscountRule } from './discount-rule.entity';
import { DiscountRuleInput, DiscountRuleService } from './discount-rule.service';
import { PriceResolutionService } from './price-resolution.service';

@Resolver('ProductVariant')
export class ProductVariantPriceResolver {
    constructor(private priceResolutionService: PriceResolutionService) {}

    @ResolveField()
    async customerPrice(
        @Ctx() ctx: RequestContext,
        @Parent() variant: { id: string },
    ): Promise<number | null> {
        return (await this.priceResolutionService.resolve(ctx, variant.id)).customerPrice;
    }

    @ResolveField()
    async compareAtPrice(
        @Ctx() ctx: RequestContext,
        @Parent() variant: { id: string },
    ): Promise<number | null> {
        return (await this.priceResolutionService.resolve(ctx, variant.id)).compareAtPrice;
    }
}

@Resolver('Mutation')
export class PriceEntryAdminResolver {
    constructor(private priceEntryService: PriceEntryService) {}

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCatalog)
    async upsertPriceEntry(
        @Ctx() ctx: RequestContext,
        @Args() args: { variantId: string; priceTypeCode: string; price: number },
    ): Promise<ProductVariantPriceEntry> {
        return this.priceEntryService.upsert(ctx, args.variantId, args.priceTypeCode, args.price);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCatalog)
    async bulkUpsertPriceEntries(
        @Ctx() ctx: RequestContext,
        @Args() args: { entries: PriceEntryInput[] },
    ): Promise<number> {
        return this.priceEntryService.bulkUpsert(ctx, args.entries);
    }
}

@Resolver('Mutation')
export class DiscountRuleAdminResolver {
    constructor(private discountRuleService: DiscountRuleService) {}

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCatalog)
    async upsertDiscountRule(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: DiscountRuleInput },
    ): Promise<DiscountRule> {
        return this.discountRuleService.upsert(ctx, args.input);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCatalog)
    async bulkUpsertDiscountRules(
        @Ctx() ctx: RequestContext,
        @Args() args: { entries: DiscountRuleInput[] },
    ): Promise<number> {
        return this.discountRuleService.bulkUpsert(ctx, args.entries);
    }
}
