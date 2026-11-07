import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { EntityNotFoundError, Allow, Ctx, RequestContext, Transaction } from '@vendure/core';
import { AccessScopeService, CustomPermission } from '@mivend/plugin-access-control';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';

import { DiscountLimit } from './discount-limit.entity';
import { DiscountLimitService } from './discount-limit.service';
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
        private lineDiscounts: LineDiscountService,
        private lineDiscountEdits: OrderLineDiscountService,
        private accessScope: AccessScopeService,
        private orderVisibility: OrderVisibilityService,
    ) {}

    @Query()
    @Allow(CustomPermission.ManageDiscountLimits.Permission)
    discountLimits(@Ctx() ctx: RequestContext): Promise<DiscountLimit[]> {
        return this.limits.list(ctx);
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
        const { roleCodes } = await this.accessScope.getActorIdentity(ctx);
        const discounts = await this.lineDiscounts.forOrderId(ctx, args.orderId);
        const ceilings = await this.limits.ceilingsForProducts(ctx, roleCodes, [
            ...new Set(discounts.map(d => d.productErpId)),
        ]);
        return discounts.map(d => ({
            orderLineId: d.lineId,
            maxDiscountPercent: ceilings.get(d.productErpId) ?? null,
            discountPercent: d.percent,
        }));
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageDiscountLimits.Permission)
    setDiscountLimit(
        @Ctx() ctx: RequestContext,
        @Args() args: { roleCode: string; groupRef?: string | null; maxDiscountPercent: number },
    ): Promise<DiscountLimit> {
        return this.limits.setLimit(
            ctx,
            args.roleCode,
            args.groupRef ?? '',
            args.maxDiscountPercent,
        );
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageDiscountLimits.Permission)
    removeDiscountLimit(
        @Ctx() ctx: RequestContext,
        @Args() args: { roleCode: string; groupRef?: string | null },
    ): Promise<boolean> {
        return this.limits.removeLimit(ctx, args.roleCode, args.groupRef ?? '');
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
