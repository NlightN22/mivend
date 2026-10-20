import { RequestContextService, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { BranchAssignmentService } from './branch-assignment.service';

// Backstop only: every trigger already reconciles; this repairs anything a lost event left behind.
export function createBranchAssignmentTask(everyMs = 15 * 60_000): ScheduledTask {
    return new ScheduledTask({
        id: 'access-control-branch-assignment',
        description:
            'Recomputes Administrator and Counterparty branch from the department mapping (central only).',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector }) => {
            const service = injector.get(BranchAssignmentService);
            if (service.isReplica) return { skipped: true };
            const ctx = await injector.get(RequestContextService).create({ apiType: 'admin' });
            await service.reconcileAll(ctx);
            return { done: true };
        },
    });
}
