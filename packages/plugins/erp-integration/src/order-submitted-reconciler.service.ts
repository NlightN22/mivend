import { Injectable, Logger } from '@nestjs/common';
import { RequestContextService } from '@vendure/core';
import { DataSource } from 'typeorm';

import { OrderSubmittedListener } from './order-submitted.listener';

const loggerCtx = 'OrderSubmittedReconciler';
const SWEEP_LIMIT = 100;

// Re-drives a reserved order that has no order.confirmed outbox row at all (crash between the
// reservation commit and the outbox write); the grace period leaves the live listener alone.
@Injectable()
export class OrderSubmittedReconciler {
    constructor(
        private readonly dataSource: DataSource,
        private readonly listener: OrderSubmittedListener,
        private readonly requestContextService: RequestContextService,
    ) {}

    async sweep(): Promise<number> {
        const orders = await this.dataSource.query<Array<{ id: string; code: string }>>(
            `SELECT o.id, o.code FROM "order" o
              WHERE o."customFieldsReservationstate" = 'RESERVED'
                AND o.state <> 'Cancelled' AND o."customFieldsIsexternal" = false
                AND o."updatedAt" < now() - interval '10 minutes'
                AND NOT EXISTS (SELECT 1 FROM integration_outbox x
                                 WHERE x.event_type = 'order.confirmed'
                                   AND x.payload ->> 'orderId' = o.id::text)
              ORDER BY o."updatedAt" ASC LIMIT ${SWEEP_LIMIT}`,
        );
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        let redriven = 0;
        for (const order of orders) {
            try {
                await this.listener.enqueueConfirmed(ctx, order.id, order.code);
                redriven += 1;
            } catch (error) {
                Logger.error(`Re-drive of order ${order.code} failed: ${String(error)}`, loggerCtx);
            }
        }
        return redriven;
    }
}
