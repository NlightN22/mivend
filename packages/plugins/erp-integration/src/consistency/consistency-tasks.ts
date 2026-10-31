import { RequestContextService, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import {
    CONSISTENCY_POLL_INTERVAL_DEFAULT,
    CONSISTENCY_RETENTION_DAYS_DEFAULT,
} from './consistency-types';
import { ConsistencyPollerService } from './consistency-poller.service';
import { ConsistencyReportStore } from './consistency-report.store';
import type { ErpIntegrationPluginOptions } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

// Central hub only; no configured source means nothing runs and no network call is made.
export function createConsistencyPollTask(options: ErpIntegrationPluginOptions): ScheduledTask {
    return new ScheduledTask({
        id: 'erp-integration-consistency-poll',
        description:
            'Collects data-drift reports from configured external systems (central hub only).',
        schedule: cronEveryMs(
            options.consistencyPollIntervalMs ?? CONSISTENCY_POLL_INTERVAL_DEFAULT,
        ),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };
            if (!options.consistencySources?.length) return { skipped: true };
            return injector.get(ConsistencyPollerService).pollAll();
        },
    });
}

export function createConsistencyRetentionTask(
    options: ErpIntegrationPluginOptions,
): ScheduledTask {
    return new ScheduledTask({
        id: 'erp-integration-consistency-retention',
        description: 'Deletes resolved data-drift reports older than the retention period.',
        schedule: cronEveryMs(DAY_MS),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };
            const ctx = await injector.get(RequestContextService).create({ apiType: 'admin' });
            const days = options.consistencyRetentionDays ?? CONSISTENCY_RETENTION_DAYS_DEFAULT;
            return {
                deleted: await injector
                    .get(ConsistencyReportStore)
                    .deleteResolvedOlderThan(ctx, days),
            };
        },
    });
}
