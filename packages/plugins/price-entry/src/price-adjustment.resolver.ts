import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { ApprovalRequest, ApprovalStepDecision } from '@mivend/plugin-approval-workflow';

import { PriceAdjustmentService, PriceAdjustmentResult } from './price-adjustment.service';
import { FloorPriceService } from './floor-price.service';

@Resolver()
export class PriceAdjustmentResolver {
    constructor(
        private priceAdjustmentService: PriceAdjustmentService,
        private floorPriceService: FloorPriceService,
    ) {}

    // The only place a human can see the raw limit price; the gate reads it for its own decision.
    // Root Query @Allow() is reliable, unlike @ResolveField() (access-control antipattern #2).
    @Query()
    @Allow(CustomPermission.ReadConfidentialPriceTypes.Permission)
    async floorPrice(
        @Ctx() ctx: RequestContext,
        @Args() args: { variantId: ID },
    ): Promise<number | null> {
        const variantId = String(args.variantId);
        return (await this.floorPriceService.forVariants(ctx, [variantId])).get(variantId) ?? null;
    }

    @Query()
    @Allow(CustomPermission.ReadConfidentialPriceTypes.Permission)
    async floorPricesForVariants(
        @Ctx() ctx: RequestContext,
        @Args() args: { variantIds: ID[] },
    ): Promise<{ variantId: string; price: number }[]> {
        const map = await this.floorPriceService.forVariants(ctx, args.variantIds.map(String));
        return [...map.entries()].map(([variantId, price]) => ({ variantId, price }));
    }

    @Transaction()
    @Mutation()
    @Allow(
        CustomPermission.AdjustPriceWithinLimit.Permission,
        CustomPermission.RequestPriceAdjustmentApproval.Permission,
    )
    async requestPriceAdjustment(
        @Ctx() ctx: RequestContext,
        @Args()
        args: { orderId: ID; orderLineId: ID; requestedPrice: number; justification?: string },
    ): Promise<PriceAdjustmentResult> {
        return this.priceAdjustmentService.requestAdjustment(
            ctx,
            args.orderId,
            args.orderLineId,
            args.requestedPrice,
            args.justification,
        );
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ApproveDiscountRequest.Permission)
    async decidePriceAdjustmentRequest(
        @Ctx() ctx: RequestContext,
        @Args() args: { requestId: ID; decision: ApprovalStepDecision; comment?: string },
    ): Promise<ApprovalRequest> {
        return this.priceAdjustmentService.decideAndApply(
            ctx,
            args.requestId,
            args.decision,
            args.comment,
        );
    }
}
