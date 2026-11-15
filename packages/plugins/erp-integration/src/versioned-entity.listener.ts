import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import { OutboundGateway } from './outbound-gateway';
import { lockKeyOf, OUTBOUND_EVENT_TYPES } from './outbound-event-types';
import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';
import { VERSIONED_ENTITIES, VERSIONED_EVENT_TYPES } from './versioned-entities';
import type { VersionedEventType } from './versioned-entities';
import { VersionedEntityBuilders } from './versioned-entity-builders';

// Runs after the change committed, so the outbox write cannot join its transaction;
// VersionedEntityReconciler re-drives a crash in between.
@Injectable()
export class VersionedEntityListener implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly gateway: OutboundGateway,
        private readonly builders: VersionedEntityBuilders,
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    onApplicationBootstrap(): void {
        if (this.options.instanceType !== 'central') return;

        for (const eventType of VERSIONED_EVENT_TYPES) {
            VERSIONED_ENTITIES[eventType].subscribe(
                this.eventBus,
                change => this.enqueueVersion(change.ctx, eventType, change.key, change.version),
                VersionedEntityListener.name,
            );
        }
    }

    async enqueueVersion(
        ctx: RequestContext,
        eventType: VersionedEventType,
        key: string,
        version: number,
    ): Promise<void> {
        const keyField = OUTBOUND_EVENT_TYPES[eventType].subjectKey;
        await this.gateway.enqueue(ctx, {
            eventType,
            subject: { [keyField]: key, version },
            lockKey: lockKeyOf(eventType, { [keyField]: key }),
            build: txCtx => this.builders.get(eventType).build(txCtx, key),
        });
    }
}
