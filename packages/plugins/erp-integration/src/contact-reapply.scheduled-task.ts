import { Logger, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { ContactReapplyService } from './contact-reapply.service';
import { loggerCtx } from './types';
import type { ErpIntegrationPluginOptions } from './types';

const TICK_EVERY_MS = 10_000;
const TICK_BUDGET_MS = 20_000;
const SLICE_SIZE = 200;

// Off unless contactReapplyEnabled (env INTEGRATION_CONTACT_REAPPLY=true) is set; progress is kept in the DB.
export function createContactReapplyTask(options: ErpIntegrationPluginOptions): ScheduledTask {
    return new ScheduledTask({
        id: 'erp-integration-contact-reapply',
        description:
            'One-off: re-applies contact lists of already processed inbox rows in bounded slices (central hub only, explicit flag).',
        schedule: cronEveryMs(TICK_EVERY_MS),
        timeout: 60_000,
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central' || !options.contactReapplyEnabled) {
                return { skipped: true };
            }
            const result = await injector
                .get(ContactReapplyService)
                .runTick(TICK_BUDGET_MS, SLICE_SIZE);
            if (result.finished) {
                Logger.info('Contact reapply finished for every stream', loggerCtx);
            }
            return result;
        },
    });
}
