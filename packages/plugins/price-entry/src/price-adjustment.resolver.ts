import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { ApprovalRequest, ApprovalStepDecision } from '@mivend/plugin-approval-workflow';

import { PriceAdjustmentService, PriceAdjustmentResult } from './price-adjustment.service';
import { PriceEntryService } from './price-entry.service';
import { FLOOR_PRICE_TYPE_CODE } from './types';

@Resolver()
export class PriceAdjustmentResolver {
    constructor(
        private priceAdjustmentService: PriceAdjustmentService,
        private priceEntryService: PriceEntryService,
    ) {}

    // The only place a human can see the raw limit price; the gate reads it for its own decision.
    // Root Query @Allow() is reliable, unlike @ResolveField() (access-control antipattern #2).
    @Query()
    @Allow(CustomPermission.ReadFloorPrice.Permission)
    async floorPrice(
        @Ctx() ctx: RequestContext,
        @Args() args: { variantId: string },
    ): Promise<number | null> {
        return this.priceEntryService.getForVariant(ctx, args.variantId, FLOOR_PRICE_TYPE_CODE);
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
