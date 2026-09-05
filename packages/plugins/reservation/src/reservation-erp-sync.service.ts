import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Order, RequestContext, StockLevelService, TransactionalConnection } from '@vendure/core';

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
        private stockLevelService: StockLevelService,
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

        if (status === 'RESERVED' || status === 'CONFIRMED') {
            await this.allocateConfirmedReservations(ctx, String(order.id));
            return;
        }

        if (status === 'SHIPPED' || status === 'DELIVERED') {
            await this.releaseAllocatedReservationsForShipment(ctx, String(order.id));
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

    // Converts each still-`active` reservation into Vendure's native stockAllocated — the
    // standard "soft reservation -> hard allocation" transition, done at 1C confirmation time
    // rather than at physical shipment (see docs/order-flow.md and this plugin's own research on
    // hard/soft allocation). From this point, stockAllocated (not the Reservation row) is what
    // protects the held quantity in the ATP formula — the row moves to 'allocated' so
    // ReservationAvailabilityService's active-reservation sum no longer double-counts it.
    private async allocateConfirmedReservations(
        ctx: RequestContext,
        orderId: string,
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, Reservation);
        const active = await repo.find({ where: { orderId: String(orderId), status: 'active' } });
        const unconfirmed = active.filter(r => !r.erpConfirmedAt);
        if (unconfirmed.length === 0) {
            return;
        }

        const now = new Date();
        for (const reservation of unconfirmed) {
            await this.stockLevelService.updateStockAllocatedForLocation(
                ctx,
                reservation.productVariantId,
                reservation.stockLocationId,
                reservation.quantity,
            );
            reservation.status = 'allocated';
            reservation.erpConfirmedAt = now;
        }
        await repo.save(unconfirmed);
    }

    // 1C reports the goods as actually shipped/delivered — the hard allocation is now fulfilled,
    // so it must be given back (decrement stockAllocated) and the reservation row closed.
    // Deliberately does NOT go through ReservationService.releaseReservations()/publish
    // ReservationReleasedEvent: that event drives an OUTBOUND "reservation.released" command back
    // to 1C (see plugin-sync's ReservationConsumer) — sending 1C a "please release this hold"
    // command right after it told us the goods shipped would be backwards (it isn't a
    // cancellation). This path only updates local state.
    private async releaseAllocatedReservationsForShipment(
        ctx: RequestContext,
        orderId: string,
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, Reservation);
        const allocated = await repo.find({
            where: { orderId: String(orderId), status: 'allocated' },
        });
        if (allocated.length === 0) {
            return;
        }

        const releasedAt = new Date();
        for (const reservation of allocated) {
            await this.stockLevelService.updateStockAllocatedForLocation(
                ctx,
                reservation.productVariantId,
                reservation.stockLocationId,
                -reservation.quantity,
            );
            reservation.status = 'released';
            reservation.releasedAt = releasedAt;
            reservation.erpReleaseOperationId = randomUUID();
        }
        await repo.save(allocated);
    }
}
