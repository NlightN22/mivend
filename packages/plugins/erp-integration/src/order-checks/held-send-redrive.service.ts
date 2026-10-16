import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus, RequestContextService } from '@vendure/core';
import { CheckPolicyChangedEvent } from '@mivend/plugin-checks';
import { OrderStaffConfirmedEvent } from '@mivend/plugin-reservation';
import { subscribeAndLog } from 'shared';
import { DataSource } from 'typeorm';

import { IntegrationOutboxRecoveryService } from '../integration-outbox-recovery.service';
import { ERP_INTEGRATION_PLUGIN_OPTIONS } from '../types';
import type { ErpIntegrationPluginOptions } from '../types';
import { HELD_SKIP_REASON } from './order-send-hold.service';

const loggerCtx = 'HeldSendRedrive';

// A send held at pre-send-to-erp leaves a `skipped` row; a staff release or a policy that stops
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
            CheckPolicyChangedEvent,
            async event => {
                const wasHolding = event.before.consequence === 'hold' && event.before.enabled;
                if (event.stage === 'pre-send-to-erp' && wasHolding) await this.redrive();
            },
            loggerCtx,
        );
    }

    async redrive(orderId?: string): Promise<void> {
        const rows: Array<{ id: string }> = await this.dataSource.query(
            `SELECT id FROM integration_outbox
              WHERE event_type = 'order.confirmed' AND status = 'skipped' AND last_error = $1
                AND ($2::text IS NULL OR payload ->> 'orderId' = $2)
              ORDER BY id`,
            [HELD_SKIP_REASON, orderId ?? null],
        );
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        for (const row of rows) {
            try {
                await this.recovery.rebuildSkipped(ctx, Number(row.id));
            } catch (error) {
                Logger.error(`Re-drive of held send ${row.id} failed: ${String(error)}`, loggerCtx);
            }
        }
    }
}
