import { Logger, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { PaymentInboxProcessorService } from './payment-inbox-processor.service';
import { PAYMENT_INBOX_POLL_INTERVAL_DEFAULT, loggerCtx } from './types';
import type { AcquiringPluginOptions } from './types';

// Recurring work uses Vendure ScheduledTask, not BullMQ: runs only in the worker, DB-locked.
// Needs DefaultSchedulerPlugin registered in vendure-config.ts.
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
