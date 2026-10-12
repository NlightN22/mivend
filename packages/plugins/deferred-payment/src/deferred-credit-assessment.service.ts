import { Injectable } from '@nestjs/common';
import { BranchSettingsService } from '@mivend/plugin-access-control';
import {
    CounterpartyService,
    CreditLimitCheckService,
    TradingPointService,
} from '@mivend/plugin-counterparty';
import { ID, Order, RequestContext } from '@vendure/core';

import { OpenDeferredExposureService } from './open-deferred-exposure.service';

export interface DeferredCreditAssessment {
    exceeded: boolean;
    availableCredit: number;
    orderAmount: number;
    allowExceedingCreditLimit: boolean;
}

// Single source of the over-limit decision, shared by the payment handler and the checkout preview.
@Injectable()
export class DeferredCreditAssessmentService {
    constructor(
        private readonly counterpartyService: CounterpartyService,
        private readonly creditLimitCheckService: CreditLimitCheckService,
        private readonly exposureService: OpenDeferredExposureService,
        private readonly branchSettingsService: BranchSettingsService,
        private readonly tradingPointService: TradingPointService,
    ) {}

    // The order's own branch once placed; before placement, the preferred trading point's servicing branch.
    private async allowsExceeding(
        ctx: RequestContext,
        order: Order,
        customerId: ID,
    ): Promise<boolean> {
        let branchId = (order.customFields as { branchId?: string | null } | undefined)?.branchId;
        if (!branchId) {
            const point = await this.tradingPointService.getPreferredForCustomer(ctx, customerId);
            branchId = point
                ? await this.tradingPointService.resolveServicingBranchId(ctx, point)
                : null;
        }
        const settings = await this.branchSettingsService.resolveEffective(ctx, branchId);
        return settings?.allowExceedingCreditLimit === true;
    }

    async assess(ctx: RequestContext, order: Order): Promise<DeferredCreditAssessment | null> {
        const customerId: ID | undefined = order.customer?.id ?? order.customerId;
        const counterparty = customerId
            ? await this.counterpartyService.getForCustomer(ctx, customerId)
            : null;
        if (!counterparty || !customerId) return null;
        const open = await this.exposureService.sumUnconfirmedRubles(
            ctx,
            counterparty.id,
            order.id,
        );
        const orderRubles = order.totalWithTax / 100;
        const decision = this.creditLimitCheckService.decide(
            counterparty,
            null,
            open + orderRubles,
        );
        return {
            exceeded: !decision.withinLimit,
            availableCredit: Math.round(
                Number(counterparty.creditLimit) - Number(counterparty.creditBalance) - open,
            ),
            orderAmount: Math.round(orderRubles),
            allowExceedingCreditLimit: await this.allowsExceeding(ctx, order, customerId),
        };
    }
}
