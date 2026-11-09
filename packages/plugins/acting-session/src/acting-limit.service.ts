import { Inject, Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { ctxQuery } from 'shared';

import {
    ACTING_SESSION_PLUGIN_OPTIONS,
    MAX_PER_CUSTOMER_DEFAULT,
    MAX_PER_MANAGER_DEFAULT,
} from './acting-session.types';
import type { ActingSessionPluginOptions } from './acting-session.types';

// Callers hold the matching advisory lock, so a parallel start or exchange cannot slip past the cap.
@Injectable()
export class ActingLimitService {
    constructor(
        private connection: TransactionalConnection,
        @Inject(ACTING_SESSION_PLUGIN_OPTIONS) private options: ActingSessionPluginOptions,
    ) {}

    // Unused tickets count too: otherwise a manager could mint tickets without bound.
    async assertManagerBelowCap(ctx: RequestContext, administratorId: string): Promise<void> {
        const now = new Date();
        const rows = await ctxQuery<Array<{ n: number }>>(
            this.connection,
            ctx,
            `SELECT (
                (SELECT count(*) FROM acting_ticket
                 WHERE "administratorId" = $1 AND "usedAt" IS NULL AND "expiresAt" > $2)
              + (SELECT count(*) FROM session
                 WHERE "customFieldsActingadministratorid" = $1 AND invalidated = false AND expires > $2)
            )::int AS n`,
            [administratorId, now],
        );
        if ((rows[0]?.n ?? 0) >= (this.options.maxPerManager ?? MAX_PER_MANAGER_DEFAULT)) {
            throw new UserInputError('Too many open acting sessions; finish one first');
        }
    }

    async assertCustomerBelowCap(ctx: RequestContext, userId: string): Promise<void> {
        const rows = await ctxQuery<Array<{ n: number }>>(
            this.connection,
            ctx,
            `SELECT count(*)::int AS n FROM session
             WHERE "userId" = $1 AND "customFieldsActingadministratorid" IS NOT NULL
               AND invalidated = false AND expires > $2`,
            [userId, new Date()],
        );
        if ((rows[0]?.n ?? 0) >= (this.options.maxPerCustomer ?? MAX_PER_CUSTOMER_DEFAULT)) {
            throw new UserInputError('The customer already has too many acting sessions open');
        }
    }
}
