import { Injectable } from '@nestjs/common';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import {
    Order,
    PaymentMetadata,
    PaymentMethodService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import {
    CREDIT_ACKNOWLEDGED_KEY,
    CREDIT_LIMIT_EXCEEDED_KEY,
    DEFAULT_PREPAYMENT_RESERVE_DAYS,
    PAYMENT_FORM_BY_METHOD_CODE,
    PLACEMENT_KEY,
    withAggregateLock,
    type PaymentForm,
    type PlacementMetadata,
} from 'shared';

import {
    DeferredCreditAssessment,
    DeferredCreditAssessmentService,
} from './deferred-credit-assessment.service';
import { decidePlacement, payableAmountKopecks, type PlacementDecision } from './placement-policy';

export interface PlacementResult {
    amount: number;
    decision: PlacementDecision;
    metadata: PaymentMetadata;
}

export interface PlacementPreview extends DeferredCreditAssessment {
    payableCardAmount: number;
    acknowledgementRequired: boolean;
    availableForms: PaymentForm[];
}

const NO_LIMIT: DeferredCreditAssessment = {
    exceeded: false,
    availableCredit: 0,
    orderAmount: 0,
    allowExceedingCreditLimit: false,
    prepaymentReserveDays: DEFAULT_PREPAYMENT_RESERVE_DAYS,
    limitControlled: false,
    excessKopecks: 0,
};

// Applies the credit policy to every payment form at placement; the exposure read and the
// payment creation share one `credit-exposure:<counterparty>` lock (docs/concurrency.md).
@Injectable()
export class CreditPlacementService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly counterpartyService: CounterpartyService,
        private readonly assessmentService: DeferredCreditAssessmentService,
        private readonly paymentMethodService: PaymentMethodService,
    ) {}

    async place(
        ctx: RequestContext,
        order: Order,
        form: PaymentForm,
        inputMetadata: PaymentMetadata = {},
    ): Promise<PlacementResult> {
        const customerId = order.customer?.id ?? order.customerId;
        const counterparty = customerId
            ? await this.counterpartyService.getForCustomer(ctx, customerId)
            : null;
        const evaluate = async (txCtx: RequestContext): Promise<PlacementResult> => {
            const assessment = (await this.assessmentService.assess(txCtx, order)) ?? NO_LIMIT;
            const decision = decidePlacement({
                form,
                limitControlled: assessment.limitControlled,
                exceeded: assessment.exceeded,
                allowExceeding: assessment.allowExceedingCreditLimit,
                acknowledged: inputMetadata[CREDIT_ACKNOWLEDGED_KEY] === true,
            });
            const reserveDays = decision.prepayment ? assessment.prepaymentReserveDays : null;
            return {
                amount: payableAmountKopecks(form, order.totalWithTax, assessment.excessKopecks),
                decision,
                metadata: {
                    ...inputMetadata,
                    public: { [CREDIT_LIMIT_EXCEEDED_KEY]: decision.creditLimitExceeded },
                    [PLACEMENT_KEY]: {
                        route: decision.route,
                        countsAgainstLimit: decision.countsAgainstLimit,
                        reserveDays,
                    } satisfies PlacementMetadata,
                },
            };
        };
        if (!counterparty) return evaluate(ctx);
        return withAggregateLock(
            this.connection,
            ctx,
            `credit-exposure:${counterparty.id}`,
            evaluate,
        );
    }

    async preview(ctx: RequestContext, order: Order): Promise<PlacementPreview> {
        const assessment = (await this.assessmentService.assess(ctx, order)) ?? NO_LIMIT;
        const quotes = await this.paymentMethodService.getEligiblePaymentMethods(ctx, order);
        const forms = quotes
            .filter(q => q.isEligible)
            .map(q => PAYMENT_FORM_BY_METHOD_CODE[q.code])
            .filter((form): form is PaymentForm => Boolean(form));
        return {
            ...assessment,
            payableCardAmount:
                payableAmountKopecks('card', order.totalWithTax, assessment.excessKopecks) / 100,
            acknowledgementRequired: assessment.exceeded,
            availableForms: [...new Set(forms)],
        };
    }
}
