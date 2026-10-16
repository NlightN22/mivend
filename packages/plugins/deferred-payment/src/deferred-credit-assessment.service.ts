import { Injectable } from '@nestjs/common';
import { BranchSettingsService } from '@mivend/plugin-access-control';
import { CheckPolicyService } from '@mivend/plugin-checks';
import {
    CounterpartyService,
    CreditLimitCheckService,
    TradingPointService,
} from '@mivend/plugin-counterparty';
import { ID, Order, RequestContext } from '@vendure/core';
import { DEFAULT_PREPAYMENT_RESERVE_DAYS } from 'shared';

import { CREDIT_LIMIT_CHECK_CODE } from './credit-limit.check';
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
        private readonly checkPolicies: CheckPolicyService,
    ) {}

    // The order's own branch once placed; before placement, the preferred trading point's servicing branch.
    private async branchId(
        ctx: RequestContext,
        order: Order,
        customerId: ID,
    ): Promise<string | null> {
        const own = (order.customFields as { branchId?: string | null } | undefined)?.branchId;
        if (own) return own;
        const point = await this.tradingPointService.getPreferredForCustomer(ctx, customerId);
        return point ? await this.tradingPointService.resolveServicingBranchId(ctx, point) : null;
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
        const branchId = await this.branchId(ctx, order, customerId);
        const settings = await this.branchSettingsService.resolveEffective(ctx, branchId);
        // The `checkout` policy of `credit.limit`: off = no limit control, hold = manager confirmation,
        // info/warn = the order may go to the ERP now once the customer acknowledges.
        const policy = await this.checkPolicies.resolve(
            ctx,
            CREDIT_LIMIT_CHECK_CODE,
            'checkout',
            branchId,
        );
        const available =
            Number(counterparty.creditLimit) - Number(counterparty.creditBalance) - open;
        return {
            exceeded: policy.enabled && limitControlled && !decision.withinLimit,
            availableCredit: Math.round(available),
            orderAmount: Math.round(orderRubles),
            allowExceedingCreditLimit: policy.enabled && policy.consequence !== 'hold',
            prepaymentReserveDays:
                settings?.prepaymentReserveDays ?? DEFAULT_PREPAYMENT_RESERVE_DAYS,
            limitControlled,
            excessKopecks: limitControlled ? Math.max(0, Math.round(-available * 100)) : 0,
        };
    }
}
