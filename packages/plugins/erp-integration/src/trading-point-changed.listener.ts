import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { TradingPointVersionedEvent } from '@mivend/plugin-counterparty';
import { subscribeAndLog } from 'shared';

import { OutboundGateway } from './outbound-gateway';
import { lockKeyOf } from './outbound-event-types';
import { TradingPointCommandBuilder } from './trading-point-command.builder';
import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Runs after the change committed, so the outbox write cannot join its transaction;
// TradingPointReconciler re-drives a crash in between.
@Injectable()
export class TradingPointChangedListener implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly gateway: OutboundGateway,
        private readonly builder: TradingPointCommandBuilder,
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    onApplicationBootstrap(): void {
        if (this.options.instanceType !== 'central') return;

        subscribeAndLog(
            this.eventBus,
            TradingPointVersionedEvent,
            event => this.handle(event),
            TradingPointChangedListener.name,
        );
    }

    private async handle(event: TradingPointVersionedEvent): Promise<void> {
        await this.enqueueVersion(event.ctx, event.tradingPointUuid, event.version);
    }

    async enqueueVersion(ctx: RequestContext, uuid: string, version: number): Promise<void> {
        await this.gateway.enqueue(ctx, {
            eventType: 'trading-point.changed',
            subject: { uuid, version },
            lockKey: lockKeyOf('trading-point.changed', { uuid }),
            build: txCtx => this.builder.build(txCtx, uuid),
        });
    }
}
