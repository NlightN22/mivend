import { Injectable, Logger } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';

import { Reservation } from './entities/reservation.entity';
import { ReservationService } from './reservation.service';
import { loggerCtx } from './types';

// Bridges 1C's own order-status callback into the local reservation domain — see
// docs/order-flow.md "1C integration" and this project's explicit decision that 1C wins in
// conflicts. Split out of ReservationService to keep that file under AGENTS.md's ~300-line
// guideline.
//
// Deliberately does NOT release a reservation on RESERVED/CONFIRMED/SHIPPED/DELIVERED (reverted
// 2026-09-05, same day it was added): those are bare status labels on the generic order-status
// callback, with no reliable guarantee that 1C has actually written off the physical stock at
// that point — RESERVED in particular may just mean "1C acknowledged/queued the document," not
// "posted it." Releasing on an unverified status reopens exactly the oversell window the
// "subtract Reservation for its entire active lifetime" ATP rule (see
// ReservationAvailabilityService) exists to close, with no backstop yet (issue #73's
// reconciliation worker isn't built). The real release trigger needs to be
// company.orders.events.v1.order-registration-result's per-line reservedLines (issue #72/#74) —
// not implemented yet. Until then, only a genuine CANCELLED keeps releasing (that one really is
// terminal and 1C-authoritative); RESERVED/CONFIRMED only record erpConfirmedAt for staff
// visibility, same as before this whole release-on-status detour.
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

        if (status === 'RESERVED' || status === 'CONFIRMED') {
            const repo = this.connection.getRepository(ctx, Reservation);
            const active = await repo.find({
                where: { orderId: String(order.id), status: 'active' },
            });
            const unconfirmed = active.filter(r => !r.erpConfirmedAt);
            if (unconfirmed.length > 0) {
                await repo.update(
                    { id: In(unconfirmed.map(r => r.id)) },
                    { erpConfirmedAt: new Date() },
                );
            }
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
}
