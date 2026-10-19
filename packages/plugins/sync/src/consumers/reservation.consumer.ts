import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus, RequestContextService, TransactionalConnection } from '@vendure/core';
import { ReservationConfirmedEvent, ReservationReleasedEvent } from '@mivend/plugin-reservation';

import { registerOutboxProducer } from '../producer-registry';
import { SyncService } from '../sync.service';
import { SYNC_PLUGIN_OPTIONS } from '../types';
import type { SyncPluginOptions } from '../types';

// plugin-reservation must not write the outbox or touch RabbitMQ; it only publishes EventBus events
// ERP delivery is outbox-based, not a shared transaction, so this write happens in plugin-sync.
@Injectable()
export class ReservationConsumer implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly syncService: SyncService,
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
        @Inject(SYNC_PLUGIN_OPTIONS) private readonly options: SyncPluginOptions,
    ) {}

    onApplicationBootstrap(): void {
        const deps = {
            eventBus: this.eventBus,
            connection: this.connection,
            requestContextService: this.requestContextService,
            syncService: this.syncService,
        };
        registerOutboxProducer(deps, ReservationConfirmedEvent, (_ctx, event) => ({
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
            target: 'erp',
        }));

        registerOutboxProducer(deps, ReservationReleasedEvent, (_ctx, event) => ({
            eventId: event.reservation.erpReleaseOperationId ?? event.reservation.erpOperationId,
            eventType: 'reservation.released',
            payload: {
                reservationId: String(event.reservation.id),
                orderCode: event.orderCode,
            },
            target: 'erp',
        }));
    }
}
