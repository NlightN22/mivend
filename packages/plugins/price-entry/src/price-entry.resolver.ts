import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import {
    ActiveOrderService,
    Allow,
    Ctx,
    ForbiddenError,
    Order,
    OrderLine,
    RequestContext,
    Transaction,
    TransactionalConnection,
} from '@vendure/core';
import { PriceTypeAccessService } from '@mivend/plugin-access-control';

import { ProductVariantPriceEntry } from './price-entry.entity';
import { PriceEntryInput, PriceEntryService } from './price-entry.service';
import { DiscountRule } from './discount-rule.entity';
import { DiscountRuleInput, DiscountRuleService, DiscountTierVM } from './discount-rule.service';
import { LookupMemo } from './lookup-memo';
import { PriceResolutionService, TierProgressVM } from './price-resolution.service';

@Resolver('ProductVariant')
export class ProductVariantPriceResolver {
    private memos = new WeakMap<RequestContext, LookupMemo>();

    constructor(
        private priceResolutionService: PriceResolutionService,
        private activeOrderService: ActiveOrderService,
    ) {}

    private memoFor(ctx: RequestContext): LookupMemo {
        let memo = this.memos.get(ctx);
        if (!memo) {
            memo = new LookupMemo();
            this.memos.set(ctx, memo);
        }
        return memo;
    }

    // Catalog view of the active order's progress; an empty or missing cart yields 0 of N.
    @ResolveField()
    async tierProgress(
        @Ctx() ctx: RequestContext,
        @Parent() variant: { id: string },
    ): Promise<TierProgressVM | null> {
        if (!ctx.activeUserId) return null;
        const order = await this.activeOrderService.getActiveOrder(ctx, undefined);
        const line = order?.lines.find(l => String(l.productVariantId) === String(variant.id));
        return this.priceResolutionService.resolveTierProgress(
            ctx,
            variant.id,
            { order: order ?? ({ lines: [] } as unknown as Order), quantity: line?.quantity ?? 0 },
            this.memoFor(ctx),
        );
    }

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

    @ResolveField()
    async discountTiers(
        @Ctx() ctx: RequestContext,
        @Parent() variant: { id: string },
    ): Promise<DiscountTierVM[]> {
        return this.priceResolutionService.resolveTiers(ctx, variant.id);
    }
}

@Resolver('OrderLine')
export class OrderLineDiscountResolver {
    // Catalog data only (facets, weights, prices, identity): safe to share by every line of one request.
    private memos = new WeakMap<RequestContext, LookupMemo>();

    constructor(
        private priceResolutionService: PriceResolutionService,
        private connection: TransactionalConnection,
    ) {}

    private memoFor(ctx: RequestContext): LookupMemo {
        let memo = this.memos.get(ctx);
        if (!memo) {
            memo = new LookupMemo();
            this.memos.set(ctx, memo);
        }
        return memo;
    }

    // Display only: unitPrice already has the discount applied; do not re-derive it here.
    @ResolveField()
    async compareAtPrice(
        @Ctx() ctx: RequestContext,
        @Parent() orderLine: { id: string },
    ): Promise<number | null> {
        const line = await this.connection.getRepository(ctx, OrderLine).findOne({
            where: { id: orderLine.id },
            relations: ['order', 'order.lines'],
        });
        if (!line) return null;
        const { compareAtPrice } = await this.priceResolutionService.resolve(
            ctx,
            String(line.productVariantId),
            { order: line.order, quantity: line.quantity },
            { memo: this.memoFor(ctx) },
        );
        return compareAtPrice;
    }

    // Progress toward the next unreached weight/amount tier for this line's facet —
    // for cart display only, so the customer knows how much more unlocks a better rung.
    @ResolveField()
    async tierProgress(
        @Ctx() ctx: RequestContext,
        @Parent() orderLine: { id: string },
    ): Promise<TierProgressVM | null> {
        const line = await this.connection.getRepository(ctx, OrderLine).findOne({
            where: { id: orderLine.id },
            relations: ['order', 'order.lines'],
        });
        if (!line) return null;
        return this.priceResolutionService.resolveTierProgress(
            ctx,
            String(line.productVariantId),
            { order: line.order, quantity: line.quantity },
            this.memoFor(ctx),
        );
    }
}

@Resolver()
export class PriceEntryAdminResolver {
    constructor(
        private priceEntryService: PriceEntryService,
        private priceTypeAccess: PriceTypeAccessService,
    ) {}

    @Query()
    @Allow(Permission.ReadCatalog)
    async priceTypeCodes(@Ctx() ctx: RequestContext): Promise<string[]> {
        return this.priceTypeAccess.allowedCodes(ctx);
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    async priceEntriesForVariants(
        @Ctx() ctx: RequestContext,
        @Args() args: { variantIds: string[]; priceTypeCode: string },
    ): Promise<{ variantId: string; price: number }[]> {
        await this.priceTypeAccess.assertCodeAllowed(ctx, args.priceTypeCode);
        const map = await this.priceEntryService.getForVariants(
            ctx,
            args.variantIds,
            args.priceTypeCode,
        );
        return [...map.entries()].map(([variantId, price]) => ({ variantId, price }));
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCatalog)
    async upsertPriceEntry(
        @Ctx() ctx: RequestContext,
        @Args() args: { variantId: string; priceTypeCode: string; price: number },
    ): Promise<ProductVariantPriceEntry> {
        await this.priceTypeAccess.assertCodeAllowed(ctx, args.priceTypeCode);
        return this.priceEntryService.upsert(ctx, args.variantId, args.priceTypeCode, args.price);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCatalog)
    async bulkUpsertPriceEntries(
        @Ctx() ctx: RequestContext,
        @Args() args: { entries: PriceEntryInput[] },
    ): Promise<number> {
        const allowed = new Set(await this.priceTypeAccess.allowedCodes(ctx));
        if (args.entries.some(e => !allowed.has(e.priceTypeCode))) throw new ForbiddenError();
        return this.priceEntryService.bulkUpsert(ctx, args.entries);
    }
}

@Resolver()
export class DiscountRuleAdminResolver {
    constructor(
        private discountRuleService: DiscountRuleService,
        private priceTypeAccess: PriceTypeAccessService,
    ) {}

    // ReadCatalog, not UpdateCatalog: anyone who can see a customer's price type can see its discounts.
    @Query()
    @Allow(Permission.ReadCatalog)
    async discountRules(
        @Ctx() ctx: RequestContext,
        @Args() args: { priceTypeCode?: string },
    ): Promise<DiscountRule[]> {
        if (args.priceTypeCode) {
            await this.priceTypeAccess.assertCodeAllowed(ctx, args.priceTypeCode);
            return this.discountRuleService.findByPriceType(ctx, args.priceTypeCode);
        }
        const allowed = await this.priceTypeAccess.allowedCodes(ctx);
        return this.discountRuleService.findByPriceType(ctx, undefined, 200, allowed);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCatalog)
    async upsertDiscountRule(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: DiscountRuleInput },
    ): Promise<DiscountRule> {
        await this.priceTypeAccess.assertCodeAllowed(ctx, args.input.priceTypeCode);
        return this.discountRuleService.upsert(ctx, args.input);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCatalog)
    async bulkUpsertDiscountRules(
        @Ctx() ctx: RequestContext,
        @Args() args: { entries: DiscountRuleInput[] },
    ): Promise<number> {
        const allowed = new Set(await this.priceTypeAccess.allowedCodes(ctx));
        if (args.entries.some(e => !allowed.has(e.priceTypeCode))) throw new ForbiddenError();
        return this.discountRuleService.bulkUpsert(ctx, args.entries);
    }
}
