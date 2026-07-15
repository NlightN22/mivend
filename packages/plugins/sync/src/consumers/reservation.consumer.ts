import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventBus } from '@vendure/core';
import { ReservationConfirmedEvent, ReservationReleasedEvent } from '@mivend/plugin-reservation';

import { SyncService } from '../sync.service';
import { SYNC_PLUGIN_OPTIONS } from '../types';
import type { SyncPluginOptions } from '../types';

// The real implementation of the pattern order.consumer.ts's OrderReadyForErpEvent subscriber
// still stubs (see that file's TODO) — writes reservation confirm/release commands to
// sync_outbox for delivery to 1C. See docs/order-flow.md "1C integration — outbox, not a
// shared transaction". plugin-reservation never touches RabbitMQ/the outbox directly (see
// AGENTS.md sync rules) — it only publishes these two EventBus events, this consumer (owned by
// plugin-sync) does the actual outbox write.
@Injectable()
export class ReservationConsumer implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly syncService: SyncService,
        private readonly dataSource: DataSource,
        @Inject(SYNC_PLUGIN_OPTIONS) private readonly options: SyncPluginOptions,
    ) {}

    onApplicationBootstrap(): void {
        this.eventBus.ofType(ReservationConfirmedEvent).subscribe(event => {
            void this.dataSource.transaction(em =>
                this.syncService.writeToOutbox(
                    em,
                    {
                        eventId: event.reservation.erpOperationId,
                        eventType: 'reservation.created',
                        payload: {
                            reservationId: String(event.reservation.id),
                            variantId: event.reservation.productVariantId,
                            branchId: this.options.instanceId,
                            quantity: event.reservation.quantity,
                            expiresAt: event.reservation.expiresAt.toISOString(),
                            orderCode: event.orderCode,
                        },
                    },
                    'erp',
                ),
            );
        });

        this.eventBus.ofType(ReservationReleasedEvent).subscribe(event => {
            void this.dataSource.transaction(em =>
                this.syncService.writeToOutbox(
                    em,
                    {
                        eventId:
                            event.reservation.erpReleaseOperationId ??
                            event.reservation.erpOperationId,
                        eventType: 'reservation.released',
                        payload: {
                            reservationId: String(event.reservation.id),
                            orderCode: event.orderCode,
                        },
                    },
                    'erp',
                ),
            );
        });
    }
}
