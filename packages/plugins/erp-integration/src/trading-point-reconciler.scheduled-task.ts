import { ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { TradingPointReconciler } from './trading-point-reconciler.service';
import type { ErpIntegrationPluginOptions } from './types';

const EVERY_MS = 10 * 60 * 1000;

export function createTradingPointReconcilerTask(
    options: ErpIntegrationPluginOptions,
): ScheduledTask {
    return new ScheduledTask({
        id: 'erp-integration-trading-point-reconciler',
        description:
            'Sends trading point versions that never got an outbound record (central hub only).',
        schedule: cronEveryMs(EVERY_MS),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };
            return { redriven: await injector.get(TradingPointReconciler).sweep() };
        },
    });
}
