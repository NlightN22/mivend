import { Injectable } from '@nestjs/common';
import { BranchSettingsService } from '@mivend/plugin-access-control';
import {
    CounterpartyService,
    CreditLimitCheckService,
    TradingPointService,
} from '@mivend/plugin-counterparty';
import { ID, Order, RequestContext } from '@vendure/core';
import { DEFAULT_PREPAYMENT_RESERVE_DAYS } from 'shared';

import { OpenDeferredExposureService } from './open-deferred-exposure.service';

export interface DeferredCreditAssessment {
    exceeded: boolean;
    availableCredit: number;
    orderAmount: number;
    allowExceedingCreditLimit: boolean;
    prepaymentReserveDays: number;
    limitControlled: boolean;
    // Debt above the limit that exists before this order, in kopecks.
    excessKopecks: number;
}

// Single source of the over-limit decision, shared by the placement policy and the checkout preview.
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
    private async branchSettings(ctx: RequestContext, order: Order, customerId: ID) {
        let branchId = (order.customFields as { branchId?: string | null } | undefined)?.branchId;
        if (!branchId) {
            const point = await this.tradingPointService.getPreferredForCustomer(ctx, customerId);
            branchId = point
                ? await this.tradingPointService.resolveServicingBranchId(ctx, point)
                : null;
        }
        return this.branchSettingsService.resolveEffective(ctx, branchId);
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
        // Terms are derived: a limit and payment delay days together mean limit control, else prepayment.
        const limitControlled =
            Number(counterparty.creditLimit) > 0 && Number(counterparty.paymentDelayDays) > 0;
        const decision = this.creditLimitCheckService.decide(
            counterparty,
            null,
            open + orderRubles,
        );
        const settings = await this.branchSettings(ctx, order, customerId);
        const available =
            Number(counterparty.creditLimit) - Number(counterparty.creditBalance) - open;
        return {
            exceeded: limitControlled && !decision.withinLimit,
            availableCredit: Math.round(available),
            orderAmount: Math.round(orderRubles),
            allowExceedingCreditLimit: settings?.allowExceedingCreditLimit === true,
            prepaymentReserveDays:
                settings?.prepaymentReserveDays ?? DEFAULT_PREPAYMENT_RESERVE_DAYS,
            limitControlled,
            excessKopecks: limitControlled ? Math.max(0, Math.round(-available * 100)) : 0,
        };
    }
}
