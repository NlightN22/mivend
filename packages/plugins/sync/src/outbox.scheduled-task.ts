import { ScheduledTask } from '@vendure/core';

import { SyncLogger } from './sync-logger';
import { SyncService } from './sync.service';
import { ERP_POLL_INTERVAL_DEFAULT, POLL_INTERVAL_DEFAULT } from './types';
import type { SyncPluginOptions } from './types';

// Issue #80: standard for recurring/periodic plugin work is Vendure's own ScheduledTask
// (DefaultSchedulerPlugin, registered in apps/server/src/vendure-config.ts) — worker-process-only
// and DB-locked out of the box, plus enable/disable + run-now via the admin API, replacing the
// previous raw BullMQ Queue+Worker (outbox.worker.ts).
//
// Draining `sync_outbox` → RabbitMQ must run on EVERY instance, not just central — a
// branch-placed order's `order.created` (target: 'central', see OrderConsumer) is written to the
// *branch's own* outbox and needs the branch's own drain to publish it. This was previously
// gated on `instanceType === 'central'` entirely (a real, live-verified bug found 2026-07-15:
// every branch-origin outbox entry sat at status='pending' forever, since nothing ever drained
// it).
export function createSyncOutboxTask(options: SyncPluginOptions): ScheduledTask {
    const everyMs = options.outboxPollIntervalMs ?? POLL_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'sync-outbox',
        description: 'Drains sync_outbox to RabbitMQ.',
        schedule: `*/${Math.max(1, Math.round(everyMs / 1000))} * * * * *`,
        execute: ({ injector }) => injector.get(SyncService).processOutbox(),
    });
}

// Genuinely central-only, per the external-integration-rules skill's "Branches never call the
// ERP or Integration Service."
export function createSyncErpPollTask(options: SyncPluginOptions): ScheduledTask {
    const everyMs = options.erpPollIntervalMs ?? ERP_POLL_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'sync-erp-poll',
        description: 'Polls the ERP adapter for changes (central hub only).',
        schedule: `*/${Math.max(1, Math.round(everyMs / 1000))} * * * * *`,
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central' || !options.erpAdapter) return { skipped: true };

            const syncService = injector.get(SyncService);
            const logger = injector.get(SyncLogger);
            try {
                const since = await syncService.getErpCursor();
                const changeSet = await options.erpAdapter.fetchChanges(since);
                await syncService.processErpChanges(changeSet);
            } catch (err) {
                logger.error('ERP poll failed', err);
                throw err;
            }
        },
    });
}
