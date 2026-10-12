import { Injectable, Logger } from '@nestjs/common';
import {
    GlobalSettingsService,
    ID,
    Order,
    Payment,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { PLACEMENT_KEY, type PlacementMetadata } from 'shared';

import { Reservation } from './entities/reservation.entity';
import { isExpectedReservationError } from './reservation-failure';
import { ReservationFailureService } from './reservation-failure.service';
import { ReservationService } from './reservation.service';
import {
    DEFAULT_PREPAID_RESERVATION_TTL_DAYS,
    DEFAULT_RESERVATION_DAYS,
    loggerCtx,
    type ReservationCreationMethod,
} from './types';

// Owns which trigger applies to an order and its TTL; reserve/state writes stay in ReservationService.
@Injectable()
export class ReservationPaymentService {
    constructor(
        private connection: TransactionalConnection,
        private reservationService: ReservationService,
        private globalSettingsService: GlobalSettingsService,
        private failureService: ReservationFailureService,
    ) {}

    // OrderPlacedEvent: the stored placement route decides (docs/payments.md); a replay is guarded by the stored state.
    async handleOrderPlaced(ctx: RequestContext, order: Order): Promise<void> {
        const placement = await this.loadPlacement(ctx, order);
        if (placement?.route === 'after-payment') {
            return;
        }

        // The event's Order can be stale; the stored state decides.
        const stored = await this.connection
            .getRepository(ctx, Order)
            .findOne({ where: { id: order.id } });
        if ((stored ?? order).customFields?.reservationState !== 'NOT_REQUIRED') {
            return;
        }
        await this.markAwaitingConfirmation(ctx, order);
        if (placement?.route === 'erp-now') {
            await this.reserveOrRecord(
                ctx,
                order.id,
                placement.reserveDays ?? DEFAULT_RESERVATION_DAYS,
                'auto-trust-rule',
            );
            return;
        }
        if (!placement) await this.autoReserveIfEnabled(ctx, order);
    }

    // Row lock + stored NOT_REQUIRED guard, so a manual confirm is never rolled back (#199); re-applied if a trailing save reverts it.
    private async markAwaitingConfirmation(ctx: RequestContext, order: Order): Promise<void> {
        const apply = (): Promise<void> =>
            this.connection.withTransaction(ctx, async txCtx => {
                const repo = this.connection.getRepository(txCtx, Order);
                const current = await repo
                    .createQueryBuilder('o')
                    .setLock('pessimistic_write')
                    .where('o.id = :id', { id: order.id })
                    .getOne();
                if (current?.customFields?.reservationState !== 'NOT_REQUIRED') return;
                // A manual confirm that won the race left an active reservation: the state is RESERVED.
                const reserved =
                    (await this.connection
                        .getRepository(txCtx, Reservation)
                        .count({ where: { orderId: String(order.id), status: 'active' } })) > 0;
                await repo.update(order.id, {
                    customFields: {
                        ...current.customFields,
                        reservationState: reserved ? 'RESERVED' : 'AWAITING_CONFIRMATION',
                    },
                });
            });
        await apply();
        for (let attempt = 0; attempt < 3; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 300));
            const current = await this.connection
                .getRepository(ctx, Order)
                .findOne({ where: { id: order.id } });
            if (current?.customFields?.reservationState !== 'NOT_REQUIRED') return;
            await apply();
        }
    }

    // Orders without a placement route only: GlobalSettings.autoReserveOnPlacement skips the manual queue.
    private async autoReserveIfEnabled(ctx: RequestContext, order: Order): Promise<void> {
        const settings = await this.globalSettingsService.getSettings(ctx);
        if (!settings.customFields?.autoReserveOnPlacement) return;
        // An over-limit order always waits for a manager (#188).
        const payments = await this.loadPayments(ctx, order);
        if (payments.some(p => p.metadata?.public?.creditLimitExceeded === true)) return;
        await this.reserveOrRecord(ctx, order.id, DEFAULT_RESERVATION_DAYS, 'auto-trust-rule');
    }

    private async reserveOrRecord(
        ctx: RequestContext,
        orderId: ID,
        ttlDays: number,
        trigger: ReservationCreationMethod,
    ): Promise<void> {
        try {
            await this.reservationService.reserveOrder(ctx, orderId, ttlDays, trigger);
        } catch (error) {
            await this.failureService.record(ctx, orderId, error);
            if (isExpectedReservationError(error)) {
                Logger.warn(
                    `Auto-reserve (${trigger}) failed for order ${String(orderId)}: ${(error as Error).message}`,
                    loggerCtx,
                );
                return;
            }
            throw error;
        }
    }

    // Only the `after-payment` route (card) reserves here, once a payment is Settled; reserveOrder() is idempotent.
    async handlePaymentStateReached(ctx: RequestContext, order: Order): Promise<void> {
        const payments = await this.loadPayments(ctx, order);
        const placement = this.placementOf(payments);
        if (placement?.route !== 'after-payment') {
            return;
        }
        if (!payments.some(p => p.state === 'Settled')) {
            return;
        }
        await this.reserveOrRecord(
            ctx,
            order.id,
            DEFAULT_PREPAID_RESERVATION_TTL_DAYS,
            'auto-prepaid',
        );
    }

    private async loadPayments(ctx: RequestContext, order: Order): Promise<Payment[]> {
        return this.connection
            .getRepository(ctx, Payment)
            .find({ where: { order: { id: order.id } } });
    }

    private async loadPlacement(
        ctx: RequestContext,
        order: Order,
    ): Promise<PlacementMetadata | null> {
        return this.placementOf(await this.loadPayments(ctx, order));
    }

    private placementOf(payments: Payment[]): PlacementMetadata | null {
        const holder = payments.find(p => p.metadata?.[PLACEMENT_KEY]);
        return holder ? (holder.metadata[PLACEMENT_KEY] as PlacementMetadata) : null;
    }
}
