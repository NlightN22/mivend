import { ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { SettlementReconcileService } from './settlement-reconcile.service';

const TEN_MINUTES_MS = 10 * 60 * 1000;

export function createSettlementReconcileTask(): ScheduledTask {
    return new ScheduledTask({
        id: 'settlement-reconcile-pending',
        description:
            'Attaches settlement rows stored before their counterparty, contract or order existed.',
        schedule: cronEveryMs(TEN_MINUTES_MS),
        execute: async ({ injector, scheduledContext }) => ({
            ...(await injector.get(SettlementReconcileService).reconcile(scheduledContext)),
        }),
    });
}
