import { Logger, RequestContextService, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { ActingCartService } from './acting-cart.service';
import { ActingSessionLivenessService } from './acting-session-liveness.service';
import { ActingTicketService } from './acting-ticket.service';
import {
    CLEANUP_POLL_INTERVAL_DEFAULT,
    SESSION_TTL_DEFAULT_MS,
    loggerCtx,
} from './acting-session.types';
import type { ActingSessionPluginOptions } from './acting-session.types';

export function createActingSessionCleanupTask(options: ActingSessionPluginOptions): ScheduledTask {
    return new ScheduledTask({
        id: 'acting-session-cleanup',
        description:
            'Ends dead acting sessions and deletes abandoned acting carts and used tickets.',
        schedule: cronEveryMs(options.cleanupPollIntervalMs ?? CLEANUP_POLL_INTERVAL_DEFAULT),
        execute: async ({ injector }) => {
            const ctx = await injector.get(RequestContextService).create({ apiType: 'admin' });
            const sessions = await injector
                .get(ActingSessionLivenessService)
                .endDeadSessions(ctx, options.sessionTtlMs ?? SESSION_TTL_DEFAULT_MS);
            const carts = await injector.get(ActingCartService).deleteAbandoned(ctx);
            const tickets = await injector.get(ActingTicketService).deleteExpired(ctx);
            if (sessions + carts + tickets > 0) {
                Logger.verbose(
                    `Ended ${sessions} session(s), deleted ${carts} cart(s) and ${tickets} ticket(s)`,
                    loggerCtx,
                );
            }
            return { sessions, carts, tickets };
        },
    });
}
