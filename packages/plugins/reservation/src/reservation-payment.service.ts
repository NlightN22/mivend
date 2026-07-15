import { Injectable, Logger } from '@nestjs/common';
import { Order, PaymentMethod, RequestContext, TransactionalConnection } from '@vendure/core';

import { InsufficientStockError, OrderNotEligibleError } from './reservation-errors';
import { ReservationService } from './reservation.service';
import { DEFAULT_PREPAID_RESERVATION_TTL_DAYS, DEFAULT_RESERVATION_DAYS, loggerCtx } from './types';

// Owns "which trigger applies to this order and what TTL should it get" — split out of
// ReservationService to keep that file under AGENTS.md's ~300-line guideline. Depends on
// ReservationService for the actual reserve/state-set work; never duplicates it.
@Injectable()
export class ReservationPaymentService {
    constructor(
        private connection: TransactionalConnection,
        private reservationService: ReservationService,
    ) {}

    // Called from an OrderPlacedEvent subscriber (reservation.plugin.ts). Prepaid orders are
    // left alone here — handlePaymentStateReached owns their auto-reserve trigger. Non-prepaid
    // (and unset/CREDIT/OFFLINE_TERMS classifications, per docs/order-flow.md's decision) enter
    // the confirmation queue. Guarded by the current state so a replayed/duplicate event never
    // clobbers a state set since (e.g. FAILED, or an already-manual-confirmed RESERVED).
    async handleOrderPlaced(ctx: RequestContext, order: Order): Promise<void> {
        const fullOrder =
            order.payments !== undefined
                ? order
                : await this.connection
                      .getRepository(ctx, Order)
                      .findOne({ where: { id: order.id }, relations: ['payments'] });
        if (!fullOrder) {
            return;
        }

        const paymentMethodCode = fullOrder.payments?.[0]?.method;
        const method = paymentMethodCode
            ? await this.getPaymentMethod(ctx, paymentMethodCode)
            : null;
        const classification = method?.customFields?.paymentClassification ?? null;
        if (classification === 'PREPAID') {
            return;
        }

        if (fullOrder.customFields?.reservationState !== 'NOT_REQUIRED') {
            return;
        }
        await this.reservationService.setOrderReservationState(
            ctx,
            fullOrder,
            'AWAITING_CONFIRMATION',
        );
    }

    // Called from an OrderStateTransitionEvent subscriber (reservation.plugin.ts) on the same
    // fromState/toState guard Vendure's own DefaultStockAllocationStrategy uses. Owns the
    // prepaid path only — non-prepaid orders are already routed to AWAITING_CONFIRMATION at
    // placement (handleOrderPlaced). reserveOrder()'s own idempotency makes this safe to call
    // for both the Authorized and Settled transitions of the same order.
    async handlePaymentStateReached(ctx: RequestContext, order: Order): Promise<void> {
        const fullOrder =
            order.payments !== undefined
                ? order
                : await this.connection
                      .getRepository(ctx, Order)
                      .findOne({ where: { id: order.id }, relations: ['payments'] });
        if (!fullOrder) {
            return;
        }

        const paymentMethodCode = fullOrder.payments?.[0]?.method;
        if (!paymentMethodCode) {
            return;
        }
        const method = await this.getPaymentMethod(ctx, paymentMethodCode);
        const classification = method?.customFields?.paymentClassification ?? null;
        if (classification !== 'PREPAID') {
            return;
        }

        const ttlDays = this.resolveReservationTtlDays(method, classification);
        try {
            await this.reservationService.reserveOrder(ctx, fullOrder.id, ttlDays, 'auto-prepaid');
        } catch (error) {
            if (error instanceof InsufficientStockError || error instanceof OrderNotEligibleError) {
                Logger.warn(
                    `Auto-reserve failed for prepaid order ${String(fullOrder.id)}: ${error.message}`,
                    loggerCtx,
                );
                return;
            }
            throw error;
        }
    }

    private async getPaymentMethod(
        ctx: RequestContext,
        paymentMethodCode: string,
    ): Promise<PaymentMethod | null> {
        return this.connection
            .getRepository(ctx, PaymentMethod)
            .findOne({ where: { code: paymentMethodCode } });
    }

    // See docs/order-flow.md "TTL (decided)": an explicit per-method override wins; otherwise
    // 30 days for PREPAID, DEFAULT_RESERVATION_DAYS (7) for everything else.
    private resolveReservationTtlDays(
        method: PaymentMethod | null,
        classification: string | null,
    ): number {
        if (method?.customFields?.reservationTtlDays) {
            return method.customFields.reservationTtlDays;
        }
        return classification === 'PREPAID'
            ? DEFAULT_PREPAID_RESERVATION_TTL_DAYS
            : DEFAULT_RESERVATION_DAYS;
    }
}
