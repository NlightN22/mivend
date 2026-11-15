import { ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { VersionedEntityReconciler } from './versioned-entity.reconciler';
import type { ErpIntegrationPluginOptions } from './types';

const EVERY_MS = 10 * 60 * 1000;

export function createVersionedEntityReconcilerTask(
    options: ErpIntegrationPluginOptions,
): ScheduledTask {
    return new ScheduledTask({
        id: 'erp-integration-versioned-entity-reconciler',
        description:
            'Sends record versions (trading points, counterparties) that never got an outbound record (central hub only).',
        schedule: cronEveryMs(EVERY_MS),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };
            return { redriven: await injector.get(VersionedEntityReconciler).sweep() };
        },
    });
}
