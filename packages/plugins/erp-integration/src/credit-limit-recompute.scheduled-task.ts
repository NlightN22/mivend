import { Logger, ScheduledTask } from '@vendure/core';
import { CreditLimitRecomputeService } from '@mivend/plugin-counterparty';
import { cronEveryMs } from 'shared';

import { CREDIT_LIMIT_RECOMPUTE_INTERVAL_DEFAULT, loggerCtx } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Not computed during import: one set-based pass over all counterparties/contracts instead.
export function createCreditLimitRecomputeTask(
    options: ErpIntegrationPluginOptions,
): ScheduledTask {
    const everyMs =
        options.creditLimitRecomputeIntervalMs ?? CREDIT_LIMIT_RECOMPUTE_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'erp-integration-credit-limit-recompute',
        description:
            "Computes each counterparty's general credit limit and clamped contract sublimits (central hub only); writes only changed rows.",
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };
            const result = await injector.get(CreditLimitRecomputeService).recomputeAll();
            if (
                result.contractsUpdated +
                    result.counterpartiesUpdated +
                    result.paymentDelaysUpdated >
                0
            ) {
                Logger.verbose(`Credit limit recompute: ${JSON.stringify(result)}`, loggerCtx);
            }
            return { ...result };
        },
    });
}
