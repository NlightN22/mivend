import { ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { SyncLogger } from './sync-logger';
import { SyncService } from './sync.service';
import { ERP_POLL_INTERVAL_DEFAULT, POLL_INTERVAL_DEFAULT } from './types';
import type { SyncPluginOptions } from './types';

// Must drain on every instance: branch orders' outbox rows are only published by the branch's drain.
// ScheduledTask, not BullMQ: DB-locked and worker-only by default, with admin enable/disable.
export function createSyncOutboxTask(options: SyncPluginOptions): ScheduledTask {
    const everyMs = options.outboxPollIntervalMs ?? POLL_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'sync-outbox',
        description: 'Drains sync_outbox to RabbitMQ.',
        schedule: cronEveryMs(everyMs),
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
        schedule: cronEveryMs(everyMs),
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
