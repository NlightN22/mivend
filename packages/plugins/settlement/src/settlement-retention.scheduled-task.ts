import { ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { SettlementRetentionService } from './settlement-retention.service';
import { RETENTION_TASK_ID } from './types';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function createSettlementRetentionTask(): ScheduledTask {
    return new ScheduledTask({
        id: RETENTION_TASK_ID,
        description:
            'Removes settlement documents that fall outside the debt window plus the retention period set in global settings.',
        schedule: cronEveryMs(SIX_HOURS_MS),
        execute: async ({ injector, scheduledContext }) => {
            const removed = await injector.get(SettlementRetentionService).sweep(scheduledContext);
            return { removed };
        },
    });
}
