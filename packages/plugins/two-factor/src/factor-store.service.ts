import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import type { FactorRow } from './two-factor.types';

const COLUMNS = `id, uuid, "userId", method, status, "secretEncrypted", "lastUsedStep"::float8 AS "lastUsedStep", "pendingExpiresAt", "activatedAt"`;

// Writes with RETURNING are wrapped in a CTE: a bare UPDATE/DELETE returns [rows, count] through TypeORM.
// All writes go through the caller's per-user lock (TwoFactorLockService), so reads here are made under it.
@Injectable()
export class FactorStoreService {
    constructor(private connection: TransactionalConnection) {}

    private query<T>(ctx: RequestContext, sql: string, params: unknown[]): Promise<T> {
        return ctxQuery<T>(this.connection, ctx, sql, params);
    }

    async find(
        ctx: RequestContext,
        userId: string,
        status: FactorRow['status'],
    ): Promise<FactorRow | null> {
        const rows = await this.query<FactorRow[]>(
            ctx,
            `SELECT ${COLUMNS} FROM two_factor_factor WHERE "userId" = $1 AND status = $2`,
            [userId, status],
        );
        return rows[0] ?? null;
    }

    async hasActive(ctx: RequestContext, userId: string): Promise<boolean> {
        const rows = await this.query<unknown[]>(
            ctx,
            `SELECT 1 FROM two_factor_factor WHERE "userId" = $1 AND status = 'active'`,
            [userId],
        );
        return rows.length > 0;
    }

    async replacePending(
        ctx: RequestContext,
        input: {
            userId: string;
            uuid: string;
            secretEncrypted: string;
            expiresAt: Date;
            method: string;
        },
    ): Promise<void> {
        await this.query(
            ctx,
            `DELETE FROM two_factor_factor WHERE "userId" = $1 AND status = 'pending'`,
            [input.userId],
        );
        await this.query(
            ctx,
            `INSERT INTO two_factor_factor (uuid, "userId", method, status, "secretEncrypted", "pendingExpiresAt")
             VALUES ($1, $2, $3, 'pending', $4, $5)`,
            [input.uuid, input.userId, input.method, input.secretEncrypted, input.expiresAt],
        );
    }

    newUuid(): string {
        return randomUUID();
    }

    // Replaces the active factor, if any; lastUsedStep starts at the step that confirmed it so that code cannot sign in again.
    async activatePending(ctx: RequestContext, userId: string, step: number): Promise<boolean> {
        const replaced = await this.query<unknown[]>(
            ctx,
            `WITH r AS (DELETE FROM two_factor_factor WHERE "userId" = $1 AND status = 'active' RETURNING id) SELECT id FROM r`,
            [userId],
        );
        const activated = await this.query<unknown[]>(
            ctx,
            `WITH r AS (UPDATE two_factor_factor SET status = 'active', "pendingExpiresAt" = NULL, "activatedAt" = $2,
                "lastUsedStep" = $3, "updatedAt" = now()
             WHERE "userId" = $1 AND status = 'pending' RETURNING id) SELECT id FROM r`,
            [userId, new Date(), step],
        );
        if (activated.length !== 1) throw new Error('No pending factor to activate');
        return replaced.length > 0;
    }

    // The single-use gate for a code: one atomic UPDATE, so two concurrent submissions of the same step cannot both pass.
    async claimStep(ctx: RequestContext, factorId: number, step: number): Promise<boolean> {
        const rows = await this.query<unknown[]>(
            ctx,
            `WITH r AS (UPDATE two_factor_factor SET "lastUsedStep" = $2, "updatedAt" = now()
             WHERE id = $1 AND ("lastUsedStep" IS NULL OR "lastUsedStep" < $2) RETURNING id) SELECT id FROM r`,
            [factorId, step],
        );
        return rows.length === 1;
    }

    async deleteAll(ctx: RequestContext, userId: string): Promise<number> {
        const rows = await this.query<unknown[]>(
            ctx,
            `WITH r AS (DELETE FROM two_factor_factor WHERE "userId" = $1 RETURNING id) SELECT id FROM r`,
            [userId],
        );
        return rows.length;
    }
}
