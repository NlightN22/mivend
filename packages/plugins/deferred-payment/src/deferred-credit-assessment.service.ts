import { Injectable } from '@nestjs/common';
import { CounterpartyService, CreditLimitCheckService } from '@mivend/plugin-counterparty';
import { ID, Order, RequestContext } from '@vendure/core';

import { OpenDeferredExposureService } from './open-deferred-exposure.service';

export interface DeferredCreditAssessment {
    exceeded: boolean;
    availableCredit: number;
    orderAmount: number;
}

// Single source of the over-limit decision, shared by the payment handler and the checkout preview.
@Injectable()
export class DeferredCreditAssessmentService {
    constructor(
        private readonly counterpartyService: CounterpartyService,
        private readonly creditLimitCheckService: CreditLimitCheckService,
        private readonly exposureService: OpenDeferredExposureService,
    ) {}

    async assess(ctx: RequestContext, order: Order): Promise<DeferredCreditAssessment | null> {
        const customerId: ID | undefined = order.customer?.id ?? order.customerId;
        const counterparty = customerId
            ? await this.counterpartyService.getForCustomer(ctx, customerId)
            : null;
        if (!counterparty) return null;
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
        };
    }
}
