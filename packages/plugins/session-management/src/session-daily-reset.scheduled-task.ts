import { Logger, RequestContextService, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { SessionDailyResetService } from './session-daily-reset.service';
import { DAILY_RESET_POLL_INTERVAL_MS, loggerCtx } from './session.types';

// Polls instead of one daily cron: Vendure's scheduler has no time zone, and a missed run is caught up next poll.
export function createSessionDailyResetTask(): ScheduledTask {
    return new ScheduledTask({
        id: 'session-daily-reset',
        description:
            'Ends every customer and staff session created before the latest daily reset hour.',
        schedule: cronEveryMs(DAILY_RESET_POLL_INTERVAL_MS),
        execute: async ({ injector }) => {
            const ctx = await injector.get(RequestContextService).create({ apiType: 'admin' });
            const ended = await injector
                .get(SessionDailyResetService)
                .endSessionsBeforeLastReset(ctx);
            if (ended > 0) {
                Logger.verbose(`Daily reset ended ${ended} session(s)`, loggerCtx);
            }
            return { ended };
        },
    });
}
