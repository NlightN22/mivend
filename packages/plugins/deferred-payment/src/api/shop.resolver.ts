import { Query, Resolver } from '@nestjs/graphql';
import { ActiveOrderService, Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import {
    DeferredCreditAssessment,
    DeferredCreditAssessmentService,
} from '../deferred-credit-assessment.service';

const NOT_EXCEEDED: DeferredCreditAssessment = {
    exceeded: false,
    availableCredit: 0,
    orderAmount: 0,
};

@Resolver()
export class DeferredCreditShopResolver {
    constructor(
        private readonly activeOrderService: ActiveOrderService,
        private readonly assessmentService: DeferredCreditAssessmentService,
    ) {}

    @Query()
    @Allow(Permission.Owner)
    async deferredCreditPreview(@Ctx() ctx: RequestContext): Promise<DeferredCreditAssessment> {
        if (!ctx.activeUserId) return NOT_EXCEEDED;
        const order = await this.activeOrderService.getActiveOrder(ctx, undefined);
        if (!order) return NOT_EXCEEDED;
        return (await this.assessmentService.assess(ctx, order)) ?? NOT_EXCEEDED;
    }
}
