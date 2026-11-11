import { Injectable } from '@nestjs/common';
import { ChecksService } from '@mivend/plugin-checks';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import {
    Order,
    PaymentMetadata,
    PaymentMethodService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import {
    AWAITING_MANAGER_KEY,
    ctxQuery,
    CARD_AMOUNT_CHANGED_CODE,
    CREDIT_ACKNOWLEDGED_KEY,
    CREDIT_LIMIT_EXCEEDED_KEY,
    DEFAULT_PREPAYMENT_RESERVE_DAYS,
    EXPECTED_AMOUNT_KEY,
    PAYMENT_FORM_BY_METHOD_CODE,
    PLACEMENT_KEY,
    hasFreightShippingLine,
    withAggregateLock,
    type PaymentForm,
    type PlacementMetadata,
} from 'shared';

import {
    DeferredCreditAssessment,
    DeferredCreditAssessmentService,
} from './deferred-credit-assessment.service';
import { PLACEMENT_CHECK_STAGE, placementCaseCode, type PlacementCaseKey } from './placement-cases';
import { decidePlacement, payableAmountKopecks, type PlacementDecision } from './placement-policy';

export const CARD_AMOUNT_CHANGED_MESSAGE = `${CARD_AMOUNT_CHANGED_CODE}: the amount to pay changed, confirm it again`;

export interface PlacementResult {
    amount: number;
    amountChanged: boolean;
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
    hasPaymentTerm: false,
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
        private readonly checks: ChecksService,
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
            const matrix = await this.matrixCase(txCtx, order, form, assessment);
            const confirmationHold = matrix?.hold === true;
            const decision = decidePlacement({
                form,
                limitControlled: assessment.limitControlled,
                exceeded: assessment.exceeded,
                allowExceeding: assessment.allowExceedingCreditLimit,
                acknowledged: inputMetadata[CREDIT_ACKNOWLEDGED_KEY] === true,
                confirmationHold,
            });
            const reserveDays = decision.prepayment ? assessment.prepaymentReserveDays : null;
            const amount = payableAmountKopecks(form, order.totalWithTax, assessment.excessKopecks);
            const expected = inputMetadata[EXPECTED_AMOUNT_KEY];
            return {
                amount,
                amountChanged: typeof expected === 'number' && expected !== amount,
                decision,
                metadata: {
                    ...inputMetadata,
                    public: {
                        [CREDIT_LIMIT_EXCEEDED_KEY]: decision.creditLimitExceeded,
                        [AWAITING_MANAGER_KEY]: decision.route === 'manager-confirmation',
                    },
                    [PLACEMENT_KEY]: {
                        route: decision.route,
                        countsAgainstLimit: decision.countsAgainstLimit,
                        reserveDays,
                        ...(matrix && {
                            confirmationCase: matrix.code,
                            confirmationHold: matrix.hold,
                        }),
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

    // Layer 2: only when the limit does not decide; the case's policy (hold) sends the order to a manager.
    private async matrixCase(
        ctx: RequestContext,
        order: Order,
        form: PaymentForm,
        assessment: DeferredCreditAssessment,
    ): Promise<{ code: string; hold: boolean } | null> {
        if (form === 'card' || assessment.exceeded) return null;
        const methods = await ctxQuery<Array<{ code: string }>>(
            this.connection,
            ctx,
            // unbounded-ok: the shipping lines of one order
            `SELECT sm.code FROM shipping_line sl
             INNER JOIN shipping_method sm ON sm.id = sl."shippingMethodId"
             WHERE sl."orderId" = $1`,
            [order.id],
        );
        const shippingLines = methods.map(m => ({ shippingMethod: { code: m.code } }));
        const key: PlacementCaseKey = {
            form,
            fulfillment: hasFreightShippingLine(shippingLines) ? 'delivery' : 'pickup',
            terms: assessment.hasPaymentTerm ? 'deferred' : 'no-terms',
        };
        const customerId = order.customer?.id ?? order.customerId;
        const branchId = customerId
            ? await this.assessmentService.resolveBranchId(ctx, order, customerId)
            : null;
        const result = await this.checks.evaluateWithInput(
            ctx,
            'order',
            { branchId },
            PLACEMENT_CHECK_STAGE,
            key,
        );
        return { code: placementCaseCode(key), hold: result.strongestConsequence === 'hold' };
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
