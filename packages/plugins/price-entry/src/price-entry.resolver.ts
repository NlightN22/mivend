import { Args, Mutation, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';

import { ProductVariantPriceEntry } from './price-entry.entity';
import { PriceEntryInput, PriceEntryService } from './price-entry.service';

@Resolver('ProductVariant')
export class ProductVariantPriceResolver {
    constructor(private priceEntryService: PriceEntryService) {}

    @ResolveField()
    async customerPrice(
        @Ctx() ctx: RequestContext,
        @Parent() variant: { id: string },
    ): Promise<number | null> {
        const priceTypeCode = await this.priceEntryService.getPriceTypeCodeForUser(ctx);
        if (!priceTypeCode) return null;
        return this.priceEntryService.getForVariant(ctx, variant.id, priceTypeCode);
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
