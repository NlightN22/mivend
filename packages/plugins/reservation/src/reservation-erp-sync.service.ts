import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';

import { Reservation } from './entities/reservation.entity';
import { ReservationService } from './reservation.service';
import { loggerCtx } from './types';

// Bridges 1C's own order-status callback into the local reservation domain — see
// docs/order-flow.md "1C integration" and this project's explicit decision that 1C wins in
// conflicts. Split out of ReservationService to keep that file under AGENTS.md's ~300-line
// guideline.
@Injectable()
export class ReservationErpSyncService {
    constructor(
        private connection: TransactionalConnection,
        private reservationService: ReservationService,
    ) {}

    async handleErpOrderStatus(
        ctx: RequestContext,
        orderCode: string,
        status: string,
    ): Promise<void> {
        const order = await this.connection
            .getRepository(ctx, Order)
            .findOne({ where: { code: orderCode } });
        if (!order) {
            return;
        }

        // RESERVED/CONFIRMED/SHIPPED/DELIVERED all release the local hold — 1C writes off
        // physical stock as a direct, same-transaction consequence of posting/confirming the
        // order, not at a later shipment step (2026-09-05), so there is no reason to keep
        // blocking sales of stock 1C has already committed elsewhere all the way to SHIPPED —
        // releasing as early as possible is the priority here (never over-restrict what can be
        // sold). SHIPPED/DELIVERED are handled the same way purely as an idempotent fallback in
        // case a CONFIRMED callback was missed; by the time they normally arrive, the reservation
        // is very likely already released. Deliberately does NOT go through
        // ReservationService.releaseReservations()/publish ReservationReleasedEvent: that event
        // drives an OUTBOUND "reservation.released" command back to 1C (plugin-sync's
        // ReservationConsumer) — sending 1C a "please release this hold" command in response to
        // its OWN confirmation/shipment notice would be backwards, since this isn't a
        // cancellation.
        if (
            status === 'RESERVED' ||
            status === 'CONFIRMED' ||
            status === 'SHIPPED' ||
            status === 'DELIVERED'
        ) {
            await this.releaseConfirmedReservations(ctx, String(order.id), status);
            return;
        }

        if (status === 'CANCELLED') {
            const released = await this.reservationService.releaseReservations(ctx, order.id);
            if (released > 0) {
                Logger.warn(
                    `Order ${orderCode} cancelled by ERP — released ${released} active reservation(s) ` +
                        `(1C is source of truth on conflicts, see docs/order-flow.md).`,
                    loggerCtx,
                );
            }
        }
    }

    private async releaseConfirmedReservations(
        ctx: RequestContext,
        orderId: string,
        status: string,
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, Reservation);
        const active = await repo.find({ where: { orderId: String(orderId), status: 'active' } });
        if (active.length === 0) {
            return;
        }

        const now = new Date();
        for (const reservation of active) {
            reservation.erpConfirmedAt = reservation.erpConfirmedAt ?? now;
            reservation.status = 'released';
            reservation.releasedAt = now;
            reservation.erpReleaseOperationId = randomUUID();
        }
        await repo.save(active);
        Logger.verbose(
            `Released ${active.length} reservation(s) for order ${orderId} on ERP status=${status}`,
            loggerCtx,
        );
    }
}
