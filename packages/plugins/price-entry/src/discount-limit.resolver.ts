import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { EntityNotFoundError, Allow, Ctx, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';

import { DiscountLimit } from './discount-limit.entity';
import { DiscountLimitService } from './discount-limit.service';
import { DiscountLimitScopeOptionsService } from './discount-limit-scope-options.service';
import type { ScopeOption } from './discount-limit-scope-options.service';
import { LineDiscountService } from './line-discount.service';
import { OrderLineDiscountService } from './order-line-discount.service';

export interface OrderLineDiscountLimit {
    orderLineId: string;
    maxDiscountPercent: number | null;
    discountPercent: number | null;
}

@Resolver()
export class DiscountLimitResolver {
    constructor(
        private limits: DiscountLimitService,
        private scopeOptions: DiscountLimitScopeOptionsService,
        private lineDiscounts: LineDiscountService,
        private lineDiscountEdits: OrderLineDiscountService,
        private orderVisibility: OrderVisibilityService,
    ) {}

    @Query()
    @Allow(CustomPermission.ManageDiscountLimits.Permission)
    discountLimits(
        @Ctx() ctx: RequestContext,
        @Args() args: { administratorId?: ID | null },
    ): Promise<DiscountLimit[]> {
        return this.limits.list(ctx, args.administratorId);
    }

    @Query()
    @Allow(CustomPermission.ManageDiscountLimits.Permission)
    discountLimitScopeOptions(
        @Ctx() ctx: RequestContext,
        @Args() args: { scopeKind: string; search?: string | null; refs?: string[] | null },
    ): Promise<ScopeOption[]> {
        return this.scopeOptions.list(ctx, args.scopeKind, args.search, args.refs);
    }

    @Query()
    @Allow(CustomPermission.AdjustPriceWithinLimit.Permission)
    async orderLineDiscountLimits(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID },
    ): Promise<OrderLineDiscountLimit[]> {
        if (
            !(await this.orderVisibility.visibleIds(ctx, [args.orderId])).has(String(args.orderId))
        ) {
            throw new EntityNotFoundError('Order', args.orderId);
        }
        const administratorId = await this.limits.actorAdministratorId(ctx);
        const discounts = await this.lineDiscounts.forOrderId(ctx, args.orderId);
        const ceilings = await this.limits.ceilingsForProducts(ctx, administratorId, [
            ...new Set(discounts.map(d => d.productErpId)),
        ]);
        const judged = await this.lineDiscounts.limitApplies(ctx, args.orderId, discounts);
        return discounts.map(d => ({
            orderLineId: d.lineId,
            maxDiscountPercent: judged.has(d.lineId) ? (ceilings.get(d.productErpId) ?? 0) : null,
            discountPercent: d.percent,
        }));
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageDiscountLimits.Permission)
    async setDiscountLimit(
        @Ctx() ctx: RequestContext,
        @Args()
        args: {
            administratorId: ID;
            scopeKind: string;
            scopeRef?: string | null;
            maxDiscountPercent: number;
        },
    ): Promise<DiscountLimit> {
        await this.limits.assertAdministratorExists(ctx, args.administratorId);
        return this.limits.setLimit(
            ctx,
            args.administratorId,
            args.scopeKind,
            args.scopeRef ?? '',
            args.maxDiscountPercent,
        );
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageDiscountLimits.Permission)
    removeDiscountLimit(
        @Ctx() ctx: RequestContext,
        @Args() args: { administratorId: ID; scopeKind: string; scopeRef?: string | null },
    ): Promise<boolean> {
        return this.limits.removeLimit(
            ctx,
            args.administratorId,
            args.scopeKind,
            args.scopeRef ?? '',
        );
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.AdjustPriceWithinLimit.Permission)
    async reduceOrderLineDiscount(
        @Ctx() ctx: RequestContext,
        @Args()
        args: { orderId: ID; orderLineId: ID; targetUnitPrice: number; justification?: string },
    ): Promise<boolean> {
        await this.lineDiscountEdits.reduce(
            ctx,
            args.orderId,
            args.orderLineId,
            args.targetUnitPrice,
            args.justification,
        );
        return true;
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.AdjustPriceWithinLimit.Permission)
    async revertOrderLineDiscount(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID; orderLineId: ID },
    ): Promise<boolean> {
        await this.lineDiscountEdits.revert(ctx, args.orderId, args.orderLineId);
        return true;
    }
}
