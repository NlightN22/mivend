import { RequestContextService, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { OrderChecksService } from './order-checks.service';

const EVERY_MS = 6 * 60 * 60 * 1000;

export function createOrderCheckFailurePruneTask(): ScheduledTask {
    return new ScheduledTask({
        id: 'order-check-failure-prune',
        description: 'Deletes order check failure records past their retention.',
        schedule: cronEveryMs(EVERY_MS),
        execute: async ({ injector }) => {
            const ctx = await injector.get(RequestContextService).create({ apiType: 'admin' });
            return { pruned: await injector.get(OrderChecksService).pruneFailures(ctx) };
        },
    });
}
