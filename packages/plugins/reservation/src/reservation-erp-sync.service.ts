import { Injectable, Logger } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { OrderStatusReferenceService } from '@mivend/plugin-erp-order';

import { Reservation } from './entities/reservation.entity';
import { ReservationService } from './reservation.service';
import { loggerCtx } from './types';

// Only CANCELLED releases a reservation: it is terminal and ERP-authoritative.
// RESERVED/CONFIRMED may only mean 'queued', so releasing on them reopens oversell.
@Injectable()
export class ReservationErpSyncService {
    constructor(
        private connection: TransactionalConnection,
        private reservationService: ReservationService,
        private statuses: OrderStatusReferenceService,
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

        const dictionary = await this.statuses.dictionary(ctx);
        if (dictionary.has(status, 'reservationConfirmed')) {
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

        if (dictionary.has(status, 'cancelled')) {
            const released = await this.reservationService.releaseReservations(ctx, order.id);
            if (released > 0) {
                Logger.warn(
                    `Order ${orderCode} cancelled by ERP — released ${released} active reservation(s) ` +
                        `(ERP is source of truth on conflicts, see docs/order-flow.md).`,
                    loggerCtx,
                );
            }
        }
    }
}
