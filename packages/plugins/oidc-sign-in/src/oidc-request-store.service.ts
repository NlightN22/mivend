import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { randomToken, sha256Hex } from './oidc-crypto';
import {
    MAX_PENDING_DEFAULT,
    OIDC_PLUGIN_OPTIONS,
    REQUEST_TTL_DEFAULT_MS,
    VERIFIED_TTL_DEFAULT_MS,
} from './oidc.types';
import type { ExchangeRow, OidcPluginOptions } from './oidc.types';

@Injectable()
export class OidcRequestStoreService {
    constructor(
        private connection: TransactionalConnection,
        @Inject(OIDC_PLUGIN_OPTIONS) private options: OidcPluginOptions | null,
    ) {}

    private query<T>(ctx: RequestContext, sql: string, params: unknown[]): Promise<T> {
        return ctxQuery<T>(this.connection, ctx, sql, params);
    }

    async create(ctx: RequestContext, nonce: string, codeVerifier: string): Promise<string | null> {
        const pending = await this.countPending(ctx);
        if (pending >= (this.options?.maxPendingRequests ?? MAX_PENDING_DEFAULT)) return null;
        const state = randomToken();
        await this.query(
            ctx,
            `INSERT INTO oidc_auth_request (uuid, "stateHash", nonce, "codeVerifier", status, "expiresAt")
             VALUES ($1, $2, $3, $4, 'PENDING', now() + ($5 * interval '1 millisecond'))`,
            [
                randomUUID(),
                sha256Hex(state),
                nonce,
                codeVerifier,
                this.options?.requestTtlMs ?? REQUEST_TTL_DEFAULT_MS,
            ],
        );
        return state;
    }

    private async countPending(ctx: RequestContext): Promise<number> {
        const rows = await this.query<Array<{ n: number }>>(
            ctx,
            `SELECT count(*)::int AS n FROM oidc_auth_request WHERE status = 'PENDING' AND "expiresAt" > now()`,
            [],
        );
        return rows[0]?.n ?? 0;
    }

    // The single-use gate for the code exchange: a replayed or concurrent second claim matches nothing.
    // UPDATE ... RETURNING goes through a CTE: the driver returns [rows, count] for a bare UPDATE.
    async beginExchange(ctx: RequestContext, state: string): Promise<ExchangeRow | null> {
        const rows = await this.query<ExchangeRow[]>(
            ctx,
            `WITH claimed AS (
                UPDATE oidc_auth_request SET status = 'EXCHANGING', "updatedAt" = now()
                WHERE "stateHash" = $1 AND status = 'PENDING' AND "expiresAt" > now()
                RETURNING id, nonce, "codeVerifier"
            ) SELECT * FROM claimed`,
            [sha256Hex(state)],
        );
        return rows[0] ?? null;
    }

    async markVerified(ctx: RequestContext, id: number, userId: string): Promise<void> {
        await this.query(
            ctx,
            `UPDATE oidc_auth_request SET status = 'VERIFIED', "userId" = $2, "updatedAt" = now(),
             "expiresAt" = now() + ($3 * interval '1 millisecond') WHERE id = $1 AND status = 'EXCHANGING'`,
            [id, userId, this.options?.verifiedTtlMs ?? VERIFIED_TTL_DEFAULT_MS],
        );
    }

    async claimVerified(ctx: RequestContext, state: string): Promise<string | null> {
        const rows = await this.query<Array<{ userId: string }>>(
            ctx,
            `WITH claimed AS (
                UPDATE oidc_auth_request SET status = 'USED', "updatedAt" = now()
                WHERE "stateHash" = $1 AND status = 'VERIFIED' AND "expiresAt" > now() RETURNING "userId"
            ) SELECT * FROM claimed`,
            [sha256Hex(state)],
        );
        return rows[0]?.userId ?? null;
    }

    async deleteExpired(ctx: RequestContext): Promise<number> {
        const rows = await this.query<Array<{ n: number }>>(
            ctx,
            `WITH d AS (DELETE FROM oidc_auth_request WHERE "expiresAt" < now() - interval '1 hour' RETURNING id)
             SELECT count(*)::int AS n FROM d`,
            [],
        );
        return rows[0]?.n ?? 0;
    }
}
