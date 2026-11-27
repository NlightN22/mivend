import { ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { ExternalOrderRetentionService } from './external-order-retention.service';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function createExternalOrderRetentionTask(): ScheduledTask {
    return new ScheduledTask({
        id: 'external-order-retention',
        description:
            'Removes ERP orders marked for deletion once their order date is older than the retention period set in global settings.',
        schedule: cronEveryMs(SIX_HOURS_MS),
        execute: async ({ injector, scheduledContext }) => ({
            removed: await injector.get(ExternalOrderRetentionService).sweep(scheduledContext),
        }),
    });
}
