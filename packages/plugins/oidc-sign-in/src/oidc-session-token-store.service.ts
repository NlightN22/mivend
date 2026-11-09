import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { OIDC_STRATEGY_NAME } from './oidc.types';

const LIVE_OIDC_SESSION = `SELECT 1 FROM session s WHERE s."userId" = t."userId"
    AND s."authenticationStrategy" = '${OIDC_STRATEGY_NAME}' AND s.invalidated = false AND s.expires > now()`;

// The ID token never leaves this service except as the id_token_hint of the caller's own sign-out.
@Injectable()
export class OidcSessionTokenStoreService {
    constructor(private connection: TransactionalConnection) {}

    private query<T>(ctx: RequestContext, sql: string, params: unknown[]): Promise<T> {
        return ctxQuery<T>(this.connection, ctx, sql, params);
    }

    async save(ctx: RequestContext, userId: number, idToken: string): Promise<void> {
        await this.query(
            ctx,
            `INSERT INTO oidc_session_token (uuid, "userId", "idToken") VALUES ($1, $2, $3)
             ON CONFLICT ("userId") DO UPDATE SET "idToken" = EXCLUDED."idToken", "updatedAt" = now()`,
            [randomUUID(), userId, idToken],
        );
    }

    // Null when the session was not opened through the provider. The token row is dropped once
    // no other live provider session of the administrator remains.
    async takeForSession(
        ctx: RequestContext,
        userId: number,
        sessionToken: string,
    ): Promise<{ idToken: string } | null> {
        const own = await this.query<unknown[]>(
            ctx,
            `SELECT 1 FROM session WHERE token = $1 AND "userId" = $2
             AND "authenticationStrategy" = '${OIDC_STRATEGY_NAME}' AND invalidated = false`,
            [sessionToken, userId],
        );
        if (own.length === 0) return null;
        const rows = await this.query<Array<{ idToken: string }>>(
            ctx,
            `WITH gone AS (
                DELETE FROM oidc_session_token t WHERE t."userId" = $1
                AND NOT EXISTS (${LIVE_OIDC_SESSION} AND s.token <> $2) RETURNING t."idToken"
            ) SELECT * FROM gone`,
            [userId, sessionToken],
        );
        if (rows[0]) return rows[0];
        const kept = await this.query<Array<{ idToken: string }>>(
            ctx,
            `SELECT "idToken" FROM oidc_session_token WHERE "userId" = $1`,
            [userId],
        );
        return kept[0] ?? null;
    }

    // The grace period keeps a token saved just before its session is opened.
    async deleteOrphans(ctx: RequestContext): Promise<number> {
        const rows = await this.query<Array<{ n: number }>>(
            ctx,
            `WITH d AS (
                DELETE FROM oidc_session_token t WHERE t."updatedAt" < now() - interval '1 hour'
                AND NOT EXISTS (${LIVE_OIDC_SESSION}) RETURNING t.id
            ) SELECT count(*)::int AS n FROM d`,
            [],
        );
        return rows[0]?.n ?? 0;
    }
}
