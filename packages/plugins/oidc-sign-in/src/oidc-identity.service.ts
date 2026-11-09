import { Injectable } from '@nestjs/common';
import { ConfigService, RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery, withAggregateLock } from 'shared';

import { OIDC_STRATEGY_NAME } from './oidc.types';
import type { OidcClaims } from './oidc.types';

interface AdminRow {
    userId: string;
    identifier: string;
}

const LOCK_TIMEOUT_MS = 15_000;
const ACTIVE_ADMIN = `FROM administrator a JOIN "user" u ON u.id = a."userId"
    WHERE a."deletedAt" IS NULL AND u."deletedAt" IS NULL`;

// Maps a verified provider identity to an existing active administrator; never creates one.
@Injectable()
export class OidcIdentityService {
    constructor(
        private connection: TransactionalConnection,
        private configService: ConfigService,
    ) {}

    // The lock covers read and link together, so two first sign-ins cannot link one sub to two accounts.
    resolve(ctx: RequestContext, claims: OidcClaims): Promise<string | null> {
        return withAggregateLock(
            this.connection,
            ctx,
            'oidc-link',
            async tx => {
                const bySub = await this.bySub(tx, claims.sub);
                if (bySub) return bySub.active && this.allowed(bySub) ? bySub.userId : null;
                return this.linkByEmail(tx, claims);
            },
            { lockTimeoutMs: LOCK_TIMEOUT_MS },
        );
    }

    private allowed(row: AdminRow): boolean {
        return row.identifier !== this.configService.authOptions.superadminCredentials.identifier;
    }

    private async bySub(
        ctx: RequestContext,
        sub: string,
    ): Promise<(AdminRow & { active: boolean }) | null> {
        const rows = await ctxQuery<Array<AdminRow & { active: boolean }>>(
            this.connection,
            ctx,
            `SELECT m."userId"::text AS "userId", u.identifier,
                    (a.id IS NOT NULL AND a."deletedAt" IS NULL AND u."deletedAt" IS NULL) AS active
             FROM authentication_method m JOIN "user" u ON u.id = m."userId"
             LEFT JOIN administrator a ON a."userId" = u.id
             WHERE m.type = 'ExternalAuthenticationMethod' AND m.strategy = $1 AND m."externalIdentifier" = $2`,
            [OIDC_STRATEGY_NAME, sub],
        );
        return rows[0] ?? null;
    }

    private async linkByEmail(ctx: RequestContext, claims: OidcClaims): Promise<string | null> {
        if (!claims.email) return null;
        const matches = await ctxQuery<AdminRow[]>(
            this.connection,
            ctx,
            `SELECT u.id::text AS "userId", u.identifier ${ACTIVE_ADMIN} AND lower(a."emailAddress") = lower($1)`,
            [claims.email],
        );
        if (matches.length !== 1 || !this.allowed(matches[0])) return null;
        const { userId } = matches[0];
        const linked = await ctxQuery<unknown[]>(
            this.connection,
            ctx,
            `SELECT 1 FROM authentication_method
             WHERE type = 'ExternalAuthenticationMethod' AND strategy = $1 AND "userId" = $2::int`,
            [OIDC_STRATEGY_NAME, userId],
        );
        if (linked.length > 0) return null;
        await ctxQuery(
            this.connection,
            ctx,
            `INSERT INTO authentication_method (type, strategy, "externalIdentifier", metadata, "userId")
             VALUES ('ExternalAuthenticationMethod', $1, $2, '{}', $3::int)`,
            [OIDC_STRATEGY_NAME, claims.sub, userId],
        );
        return userId;
    }
}
