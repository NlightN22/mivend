import { ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { HeldSendRedriveService } from './held-send-redrive.service';
import { PointConfirmationExpiryService } from './point-confirmation-expiry.service';
import type { ErpIntegrationPluginOptions } from '../types';

const EVERY_MS = 5 * 60 * 1000;

// Safety net behind the event fast path (staff confirmation, policy change); central hub only.
export function createHeldSendRedriveTask(options: ErpIntegrationPluginOptions): ScheduledTask {
    return new ScheduledTask({
        id: 'erp-integration-held-send-redrive',
        description:
            'Re-evaluates sends held by an order check policy and sends the ones no longer held.',
        schedule: cronEveryMs(EVERY_MS),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };
            const queued = await injector.get(HeldSendRedriveService).sweep();
            return {
                queued,
                expired: await injector.get(PointConfirmationExpiryService).expireDue(),
            };
        },
    });
}
