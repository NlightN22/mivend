import { Logger, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { ReservationExpiryService } from './reservation-expiry.service';
import { EXPIRY_POLL_INTERVAL_DEFAULT, loggerCtx } from './types';
import type { ReservationPluginOptions } from './types';

// Issue #80: standard for recurring/periodic plugin work is Vendure's own ScheduledTask
// (DefaultSchedulerPlugin, registered in apps/server/src/vendure-config.ts) — worker-process-only
// and DB-locked out of the box, plus enable/disable + run-now via the admin API, replacing the
// previous raw BullMQ Queue+Worker (reservation-expiry.worker.ts).
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
