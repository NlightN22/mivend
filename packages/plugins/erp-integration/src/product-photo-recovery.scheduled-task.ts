import { RequestContextService, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { ProductPhotoRecoveryService } from './product-photo-recovery.service';
import type { ErpIntegrationPluginOptions } from './types';

const PHOTO_RECOVERY_INTERVAL_MS = 10 * 60_000;

export function createProductPhotoRecoveryTask(
    options: ErpIntegrationPluginOptions,
): ScheduledTask {
    return new ScheduledTask({
        id: 'erp-integration-product-photo-recovery',
        description:
            'Retries product photos whose download got stuck and asks Integration Service for a fresh link for failed ones (central hub only).',
        schedule: cronEveryMs(PHOTO_RECOVERY_INTERVAL_MS),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };
            const ctx = await injector.get(RequestContextService).create({ apiType: 'admin' });
            return injector.get(ProductPhotoRecoveryService).recover(ctx);
        },
    });
}
