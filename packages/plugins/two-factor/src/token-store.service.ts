import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { hashToken, newToken } from './token-hash';
import type { TokenPurpose, TokenRow, TwoFactorApi } from './two-factor.types';

const COLUMNS = `id, "userId", purpose, stage, "apiType", "expiresAt", "usedAt", attempts`;

export interface IssueTokenInput {
    userId: string;
    purpose: TokenPurpose;
    ttlMs: number;
    stage?: 'VERIFY' | 'ENROL';
    apiType?: TwoFactorApi;
}

@Injectable()
export class TokenStoreService {
    constructor(private connection: TransactionalConnection) {}

    private query<T>(ctx: RequestContext, sql: string, params: unknown[]): Promise<T> {
        return ctxQuery<T>(this.connection, ctx, sql, params);
    }

    async issue(
        ctx: RequestContext,
        input: IssueTokenInput,
    ): Promise<{ token: string; expiresAt: Date }> {
        const token = newToken();
        const rows = await this.query<Array<{ expiresAt: Date }>>(
            ctx,
            `WITH r AS (INSERT INTO two_factor_token (uuid, "tokenHash", purpose, "userId", stage, "apiType", "expiresAt")
             VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 * interval '1 millisecond')) RETURNING "expiresAt")
             SELECT "expiresAt" FROM r`,
            [
                randomUUID(),
                hashToken(token),
                input.purpose,
                input.userId,
                input.stage ?? null,
                input.apiType ?? null,
                input.ttlMs,
            ],
        );
        return { token, expiresAt: rows[0].expiresAt };
    }

    // Only the owner of the hash is looked up before the per-user lock; callers re-check state under the lock.
    async findUserId(
        ctx: RequestContext,
        token: string,
        purpose: TokenPurpose,
    ): Promise<string | null> {
        const rows = await this.query<Array<{ userId: string }>>(
            ctx,
            `SELECT "userId" FROM two_factor_token WHERE "tokenHash" = $1 AND purpose = $2`,
            [hashToken(token), purpose],
        );
        return rows[0]?.userId ?? null;
    }

    async findUsable(
        ctx: RequestContext,
        token: string,
        purpose: TokenPurpose,
        maxAttempts: number,
    ): Promise<TokenRow | null> {
        const rows = await this.query<TokenRow[]>(
            ctx,
            `SELECT ${COLUMNS} FROM two_factor_token
             WHERE "tokenHash" = $1 AND purpose = $2 AND "usedAt" IS NULL AND "expiresAt" > now() AND attempts < $3`,
            [hashToken(token), purpose, maxAttempts],
        );
        return rows[0] ?? null;
    }

    async recordFailure(ctx: RequestContext, id: number): Promise<void> {
        await this.query(ctx, `UPDATE two_factor_token SET attempts = attempts + 1 WHERE id = $1`, [
            id,
        ]);
    }

    async hasRecentRecovery(
        ctx: RequestContext,
        userId: string,
        windowMs: number,
    ): Promise<boolean> {
        const rows = await this.query<unknown[]>(
            ctx,
            `SELECT 1 FROM two_factor_token
             WHERE "userId" = $1 AND purpose = 'recovery' AND "createdAt" > now() - ($2 * interval '1 millisecond')`,
            [userId, windowMs],
        );
        return rows.length > 0;
    }

    // The single-use gate: a concurrent second claim matches nothing.
    async claim(ctx: RequestContext, id: number): Promise<boolean> {
        const rows = await this.query<unknown[]>(
            ctx,
            `WITH r AS (UPDATE two_factor_token SET "usedAt" = now(), "updatedAt" = now()
             WHERE id = $1 AND "usedAt" IS NULL AND "expiresAt" > now() RETURNING id) SELECT id FROM r`,
            [id],
        );
        return rows.length === 1;
    }

    async consumeOpen(ctx: RequestContext, userId: string, purpose: TokenPurpose): Promise<void> {
        await this.query(
            ctx,
            `UPDATE two_factor_token SET "usedAt" = now(), "updatedAt" = now()
             WHERE "userId" = $1 AND purpose = $2 AND "usedAt" IS NULL`,
            [userId, purpose],
        );
    }

    async deleteExpired(ctx: RequestContext): Promise<number> {
        const rows = await this.query<Array<{ n: number }>>(
            ctx,
            `WITH d AS (DELETE FROM two_factor_token WHERE "expiresAt" < now() - interval '1 hour' RETURNING 1)
             SELECT count(*)::int AS n FROM d`,
            [],
        );
        return rows[0]?.n ?? 0;
    }
}
