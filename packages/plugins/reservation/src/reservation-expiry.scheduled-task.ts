import { Logger, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { ReservationExpiryService } from './reservation-expiry.service';
import { EXPIRY_POLL_INTERVAL_DEFAULT, loggerCtx } from './types';
import type { ReservationPluginOptions } from './types';

// Use ScheduledTask, not BullMQ: runs only in the worker process and is DB-locked by default
// Registered via DefaultSchedulerPlugin in vendure-config.ts; admin API toggles it and runs on demand
export function createReservationExpiryTask(options: ReservationPluginOptions): ScheduledTask {
    const everyMs = options.expiryPollIntervalMs ?? EXPIRY_POLL_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'reservation-expiry',
        description: 'Expires reservations past their expiresAt and releases their stock.',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector }) => {
            const expired = await injector.get(ReservationExpiryService).expireDueReservations();
            if (expired > 0) {
                Logger.verbose(`Expired ${expired} due reservation(s)`, loggerCtx);
            }
            return { expired };
        },
    });
}
