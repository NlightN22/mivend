import { ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { ExternalOrderReconcileService } from './external-order-reconcile.service';

const TEN_MINUTES_MS = 10 * 60 * 1000;

export function createExternalOrderReconcileTask(): ScheduledTask {
    return new ScheduledTask({
        id: 'external-order-counterparty-reconcile',
        description:
            'Attaches external orders waiting for their counterparty once the counterparty exists.',
        schedule: cronEveryMs(TEN_MINUTES_MS),
        execute: async ({ injector, scheduledContext }) =>
            injector
                .get(ExternalOrderReconcileService)
                .reconcilePendingCounterparties(scheduledContext),
    });
}
