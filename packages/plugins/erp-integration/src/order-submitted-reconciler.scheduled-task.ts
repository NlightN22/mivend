import { ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { OrderSubmittedReconciler } from './order-submitted-reconciler.service';
import type { ErpIntegrationPluginOptions } from './types';

const EVERY_MS = 10 * 60 * 1000;

export function createOrderSubmittedReconcilerTask(
    options: ErpIntegrationPluginOptions,
): ScheduledTask {
    return new ScheduledTask({
        id: 'erp-integration-order-submitted-reconciler',
        description:
            'Sends reserved orders that never got an outbound order record (central hub only).',
        schedule: cronEveryMs(EVERY_MS),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };
            return { redriven: await injector.get(OrderSubmittedReconciler).sweep() };
        },
    });
}
