import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus, RequestContextService } from '@vendure/core';
import { CheckPolicyChangedEvent } from '@mivend/plugin-checks';
import { OrderDeliveryEditedEvent, OrderStaffConfirmedEvent } from '@mivend/plugin-reservation';
import { subscribeAndLog } from 'shared';
import { DataSource } from 'typeorm';

import {
    IntegrationOutboxRecoveryService,
    NotSkippedError,
} from '../integration-outbox-recovery.service';
import { ERP_INTEGRATION_PLUGIN_OPTIONS } from '../types';
import type { ErpIntegrationPluginOptions } from '../types';
import { COURIER_WITHOUT_POINT_SKIP_REASON } from '../order-submitted.builder';
import { HELD_SKIP_REASON } from './order-send-hold.service';

const loggerCtx = 'HeldSendRedrive';
const SWEEP_LIMIT = 200;

// A send held at pre-send-to-erp, or a courier order without a point, leaves a `skipped` row; a staff release or a policy that stops
// holding re-drives it through the normal rebuild, so a hold can never block the send for good.
@Injectable()
export class HeldSendRedriveService implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly dataSource: DataSource,
        private readonly recovery: IntegrationOutboxRecoveryService,
        private readonly requestContextService: RequestContextService,
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    onApplicationBootstrap(): void {
        if (this.options.instanceType !== 'central') return;
        subscribeAndLog(
            this.eventBus,
            OrderStaffConfirmedEvent,
            event => this.redrive(String(event.orderId)),
            loggerCtx,
        );
        subscribeAndLog(
            this.eventBus,
            OrderDeliveryEditedEvent,
            event => this.redrive(String(event.orderId)),
            loggerCtx,
        );
        subscribeAndLog(
            this.eventBus,
            CheckPolicyChangedEvent,
            async event => {
                const wasHolding = event.before.consequence === 'hold' && event.before.enabled;
                if (event.stage === 'pre-send-to-erp' && wasHolding) await this.redrive();
            },
            loggerCtx,
        );
    }

    async redrive(orderId?: string): Promise<void> {
        await this.rebuildHeld(orderId, 1000);
    }

    // Periodic and idempotent: covers missed events, failed rebuilds (growing delay, given up after 7 days,
    // then left counted as skipped) and holds whose cause vanished with new data. Oldest attempt first.
    async sweep(): Promise<number> {
        return this.rebuildHeld(undefined, SWEEP_LIMIT);
    }

    private async rebuildHeld(orderId: string | undefined, limit: number): Promise<number> {
        const rows: Array<{ id: string }> = await this.dataSource.query(
            `SELECT id FROM integration_outbox
              WHERE event_type = 'order.confirmed' AND status = 'skipped'
                AND (last_error = $1 OR last_error = $4 OR (last_error LIKE 'rebuild failed:%' AND ($3 OR (
                       created_at > now() - interval '7 days'
                       AND (last_error_at IS NULL OR last_error_at <= now() - GREATEST(
                            interval '5 minutes', LEAST(interval '1 day', last_error_at - created_at)))))))
                AND ($2::text IS NULL OR payload ->> 'orderId' = $2)
              ORDER BY last_error_at ASC NULLS FIRST, id LIMIT ${limit}`,
            [
                HELD_SKIP_REASON,
                orderId ?? null,
                orderId !== undefined,
                COURIER_WITHOUT_POINT_SKIP_REASON,
            ],
        );
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        let queued = 0;
        for (const row of rows) {
            try {
                if ((await this.recovery.rebuildSkipped(ctx, Number(row.id))) === 'queued') {
                    queued += 1;
                }
            } catch (error) {
                if (error instanceof NotSkippedError) continue;
                Logger.error(`Re-drive of held send ${row.id} failed: ${String(error)}`, loggerCtx);
            }
        }
        return queued;
    }
}
