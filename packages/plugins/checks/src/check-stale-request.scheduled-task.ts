import { ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { CheckStaleRequestService } from './check-stale-request.service';

// Retries every pending stale request until done; the handlers also trigger a pass right after commit.
export function createCheckStaleRequestTask(everyMs = 60_000): ScheduledTask {
    return new ScheduledTask({
        id: 'check-stale-requests',
        description:
            'Marks check results stale for pending data-change and policy-change requests.',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector }) => ({
            done: await injector.get(CheckStaleRequestService).drain(),
        }),
    });
}
