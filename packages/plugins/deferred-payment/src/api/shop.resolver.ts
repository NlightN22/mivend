import { Query, Resolver } from '@nestjs/graphql';
import { ActiveOrderService, Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { DEFAULT_PREPAYMENT_RESERVE_DAYS } from 'shared';

import { CreditPlacementService, PlacementPreview } from '../credit-placement.service';

const EMPTY_PREVIEW: PlacementPreview = {
    exceeded: false,
    availableCredit: 0,
    orderAmount: 0,
    allowExceedingCreditLimit: false,
    prepaymentReserveDays: DEFAULT_PREPAYMENT_RESERVE_DAYS,
    limitControlled: false,
    excessKopecks: 0,
    payableCardAmount: 0,
    acknowledgementRequired: false,
    availableForms: [],
};

@Resolver()
export class DeferredCreditShopResolver {
    constructor(
        private readonly activeOrderService: ActiveOrderService,
        private readonly placementService: CreditPlacementService,
    ) {}

    @Query()
    @Allow(Permission.Owner)
    async deferredCreditPreview(@Ctx() ctx: RequestContext): Promise<PlacementPreview> {
        if (!ctx.activeUserId) return EMPTY_PREVIEW;
        const order = await this.activeOrderService.getActiveOrder(ctx, undefined);
        if (!order) return EMPTY_PREVIEW;
        return this.placementService.preview(ctx, order);
    }
}
