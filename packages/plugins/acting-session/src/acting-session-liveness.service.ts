import { Injectable } from '@nestjs/common';
import { ConfigService, RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

const DEAD_PREDICATE = `s."customFieldsActingadministratorid" IS NOT NULL AND s.invalidated = false AND (
    s."createdAt" < $1
    OR NOT EXISTS (
        SELECT 1 FROM session p
        WHERE p.id::text = s."customFieldsActingparentsessionid" AND p.invalidated = false AND p.expires > $2)
    OR NOT EXISTS (
        SELECT 1 FROM administrator a
        JOIN "user" u ON u.id = a."userId"
        JOIN user_roles_role ur ON ur."userId" = u.id
        JOIN role r ON r.id = ur."roleId"
        WHERE a.id::text = s."customFieldsActingadministratorid"
            AND a."deletedAt" IS NULL AND u."deletedAt" IS NULL
            AND string_to_array(r.permissions, ',') && ARRAY['CreateOrder', 'SuperAdmin'])
)`;

// One predicate ends an acting session when its lifetime ran out, the manager's own session ended
// (sign-out, deactivation) or the manager lost the right to start the mode.
@Injectable()
export class ActingSessionLivenessService {
    constructor(
        private connection: TransactionalConnection,
        private configService: ConfigService,
    ) {}

    endDeadSession(ctx: RequestContext, token: string, sessionTtlMs: number): Promise<number> {
        return this.end(ctx, sessionTtlMs, 's.token = $3 AND ', [token]);
    }

    endDeadSessions(ctx: RequestContext, sessionTtlMs: number): Promise<number> {
        return this.end(ctx, sessionTtlMs, '', []);
    }

    endDeadSessionsOfAdministrator(
        ctx: RequestContext,
        sessionTtlMs: number,
        administratorId: string,
    ): Promise<number> {
        return this.end(ctx, sessionTtlMs, 's."customFieldsActingadministratorid" = $3 AND ', [
            administratorId,
        ]);
    }

    endDeadSessionsOfUser(
        ctx: RequestContext,
        sessionTtlMs: number,
        userId: string,
    ): Promise<number> {
        return this.end(ctx, sessionTtlMs, 's."userId" = $3 AND ', [userId]);
    }

    private async end(
        ctx: RequestContext,
        sessionTtlMs: number,
        filter: string,
        params: unknown[],
    ): Promise<number> {
        const now = new Date();
        const rows = await ctxQuery<Array<{ token: string }>>(
            this.connection,
            ctx,
            `WITH ended AS (
                UPDATE session s SET invalidated = true
                WHERE ${filter}${DEAD_PREDICATE}
                RETURNING s.token
            ) SELECT token FROM ended`,
            [new Date(now.getTime() - sessionTtlMs), now, ...params],
        );
        for (const { token } of rows) {
            await this.configService.authOptions.sessionCacheStrategy.delete(token);
        }
        return rows.length;
    }
}
