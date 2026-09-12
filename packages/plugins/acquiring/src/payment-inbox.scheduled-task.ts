import { Logger, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { PaymentInboxProcessorService } from './payment-inbox-processor.service';
import { PAYMENT_INBOX_POLL_INTERVAL_DEFAULT, loggerCtx } from './types';
import type { AcquiringPluginOptions } from './types';

// Issue #80: standard for recurring/periodic plugin work is Vendure's own ScheduledTask
// (DefaultSchedulerPlugin, registered in apps/server/src/vendure-config.ts) — worker-process-only
// and DB-locked out of the box, plus enable/disable + run-now via the admin API, replacing the
// previous raw BullMQ Queue+Worker (payment-inbox.worker.ts).
export function createPaymentInboxTask(options: AcquiringPluginOptions): ScheduledTask {
    const everyMs = options.paymentInboxPollIntervalMs ?? PAYMENT_INBOX_POLL_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'payment-inbox',
        description:
            'Recovery sweep for incoming payment events that failed or arrived while something was down.',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector, scheduledContext }) => {
            const { processed, failed } = await injector
                .get(PaymentInboxProcessorService)
                .processPendingEvents(scheduledContext);
            if (processed > 0 || failed > 0) {
                Logger.verbose(
                    `Payment inbox sweep: ${processed} processed, ${failed} failed/retrying`,
                    loggerCtx,
                );
            }
            return { processed, failed };
        },
    });
}
