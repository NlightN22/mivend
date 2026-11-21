import { ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { ExchangeHealthPollerService } from './exchange-health-poller.service';
import { EXCHANGE_HEALTH_POLL_INTERVAL_DEFAULT } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Central hub only; an unconfigured service is recorded as UNKNOWN (NOT_CONFIGURED), not skipped silently.
export function createExchangeHealthPollTask(options: ErpIntegrationPluginOptions): ScheduledTask {
    const everyMs = options.exchangeHealthPollIntervalMs ?? EXCHANGE_HEALTH_POLL_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'erp-integration-exchange-health-poll',
        description:
            'Reads the Integration Service exchange health for the admin (central hub only).',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };
            return injector.get(ExchangeHealthPollerService).pollOnce();
        },
    });
}
