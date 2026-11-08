import { Inject, Injectable } from '@nestjs/common';
import { ConfigService, RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { lastResetInstant } from './reset-instant';
import { OWN_SESSION_SQL, SESSION_MANAGEMENT_PLUGIN_OPTIONS } from './session.types';
import type { SessionManagementPluginOptions } from './session.types';

@Injectable()
export class SessionDailyResetService {
    constructor(
        @Inject(SESSION_MANAGEMENT_PLUGIN_OPTIONS)
        private options: SessionManagementPluginOptions,
        private configService: ConfigService,
        private connection: TransactionalConnection,
    ) {}

    // Idempotent and stateless: every run ends sessions created before the latest reset instant,
    // so concurrent or missed runs converge. The clock is the database's, not the process's.
    async endSessionsBeforeLastReset(ctx: RequestContext): Promise<number> {
        const reset = this.options.dailyReset;
        if (!reset?.enabled) {
            return 0;
        }
        const [{ now }] = await ctxQuery<Array<{ now: Date }>>(
            this.connection,
            ctx,
            'SELECT now() AS now',
        );
        const instant = lastResetInstant(now, reset.hour, reset.timeZone);
        // createdAt is written by the DB default (DB session zone): compare as timestamptz, not a node-local wall time.
        const rows = await ctxQuery<Array<{ token: string }>>(
            this.connection,
            ctx,
            `WITH ended AS (
                UPDATE session SET invalidated = true
                WHERE ${OWN_SESSION_SQL} AND "createdAt" < $1::timestamptz RETURNING token
            ) SELECT token FROM ended`,
            [instant.toISOString()],
        );
        for (const { token } of rows) {
            await this.configService.authOptions.sessionCacheStrategy.delete(token);
        }
        return rows.length;
    }
}
