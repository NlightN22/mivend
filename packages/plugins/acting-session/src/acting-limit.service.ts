import { Inject, Injectable } from '@nestjs/common';
import { ConfigService, Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery, ctxQueryBounded } from 'shared';

import { ActingSessionLivenessService } from './acting-session-liveness.service';
import {
    ACTING_SESSION_PLUGIN_OPTIONS,
    SESSION_TTL_DEFAULT_MS,
    MAX_PER_CUSTOMER_DEFAULT,
    MAX_PER_MANAGER_DEFAULT,
    loggerCtx,
} from './acting-session.types';
import type { ActingSessionPluginOptions } from './acting-session.types';

interface OpenItem {
    kind: 'ticket' | 'session';
    ref: string;
}

// Callers hold the matching advisory lock. Over the cap the oldest open items end, so the new one always fits.
@Injectable()
export class ActingLimitService {
    constructor(
        private connection: TransactionalConnection,
        private configService: ConfigService,
        private liveness: ActingSessionLivenessService,
        @Inject(ACTING_SESSION_PLUGIN_OPTIONS) private options: ActingSessionPluginOptions,
    ) {}

    // Unused tickets count too: otherwise a manager could mint tickets without bound.
    async enforceManagerCap(ctx: RequestContext, administratorId: string): Promise<number> {
        await this.liveness.endDeadSessionsOfAdministrator(ctx, this.ttl(), administratorId);
        const now = new Date();
        const open = await ctxQueryBounded<OpenItem>(
            this.connection,
            ctx,
            `SELECT kind, ref FROM (
                SELECT 'ticket' AS kind, "tokenHash" AS ref, "createdAt" FROM acting_ticket
                WHERE "administratorId" = $1 AND "usedAt" IS NULL AND "expiresAt" > $2
                UNION ALL
                SELECT 'session', token, "createdAt" FROM session
                WHERE "customFieldsActingadministratorid" = $1 AND invalidated = false AND expires > $2
            ) open ORDER BY "createdAt" DESC, ref DESC OFFSET $3`,
            [administratorId, now, (this.options.maxPerManager ?? MAX_PER_MANAGER_DEFAULT) - 1],
        );
        for (const item of open) {
            if (item.kind === 'ticket') await this.endTicket(ctx, item.ref, now);
            else await this.endSession(ctx, item.ref);
        }
        this.logEvicted(open.length, `administrator=${administratorId}`);
        return open.length;
    }

    async enforceCustomerCap(ctx: RequestContext, userId: string): Promise<number> {
        await this.liveness.endDeadSessionsOfUser(ctx, this.ttl(), userId);
        const rows = await ctxQueryBounded<{ token: string }>(
            this.connection,
            ctx,
            `SELECT token FROM session
             WHERE "userId" = $1 AND "customFieldsActingadministratorid" IS NOT NULL
               AND invalidated = false AND expires > $2
             ORDER BY "createdAt" DESC, id DESC OFFSET $3`,
            [userId, new Date(), (this.options.maxPerCustomer ?? MAX_PER_CUSTOMER_DEFAULT) - 1],
        );
        for (const { token } of rows) await this.endSession(ctx, token);
        this.logEvicted(rows.length, `user=${userId}`);
        return rows.length;
    }

    // Dead sessions of the owner (manager signed out, lost the right) must not fill slots or push out live ones.
    private ttl(): number {
        return this.options.sessionTtlMs ?? SESSION_TTL_DEFAULT_MS;
    }

    private async endTicket(ctx: RequestContext, tokenHash: string, now: Date): Promise<void> {
        await ctxQuery<unknown>(
            this.connection,
            ctx,
            'UPDATE acting_ticket SET "usedAt" = $2 WHERE "tokenHash" = $1',
            [tokenHash, now],
        );
    }

    private async endSession(ctx: RequestContext, token: string): Promise<void> {
        await ctxQuery<unknown>(
            this.connection,
            ctx,
            'UPDATE session SET invalidated = true WHERE token = $1',
            [token],
        );
        await this.configService.authOptions.sessionCacheStrategy.delete(token);
    }

    private logEvicted(count: number, owner: string): void {
        if (count > 0) {
            Logger.info(
                `Acting cap reached: ended ${count} oldest open item(s) of ${owner}`,
                loggerCtx,
            );
        }
    }
}
