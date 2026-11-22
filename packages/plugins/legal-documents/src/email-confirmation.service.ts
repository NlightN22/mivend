import { randomBytes } from 'crypto';

import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { EmailConfirmation } from './entities/email-confirmation.entity';

export const normalizeEmail = (email: string | null | undefined): string | null =>
    email?.trim().toLowerCase() || null;

interface Row {
    customerId: number;
    confirmedEmail: string | null;
}

// Each write is one statement, so concurrent requests need no lock (docs/concurrency.md).
@Injectable()
export class EmailConfirmationService {
    constructor(private connection: TransactionalConnection) {}

    // TypeORM returns [rows, count] for UPDATE ... RETURNING on Postgres.
    private async query(ctx: RequestContext, sql: string, params: unknown[]): Promise<Row[]> {
        const result: unknown = await this.connection
            .getRepository(ctx, EmailConfirmation)
            .query(sql, params);
        const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
        return rows as Row[];
    }

    async isConfirmed(
        ctx: RequestContext,
        customerId: number,
        email: string | null | undefined,
    ): Promise<boolean> {
        const current = normalizeEmail(email);
        if (!current) return false;
        const rows = await this.query(
            ctx,
            `SELECT "confirmedEmail" FROM email_confirmation WHERE "customerId" = $1`,
            [customerId],
        );
        return rows[0]?.confirmedEmail === current;
    }

    async markConfirmed(ctx: RequestContext, customerId: number, email: string): Promise<void> {
        await this.query(
            ctx,
            `INSERT INTO email_confirmation (uuid, "customerId", "confirmedEmail")
             VALUES (gen_random_uuid(), $1, $2)
             ON CONFLICT ("customerId") DO UPDATE
             SET "confirmedEmail" = $2, "pendingEmail" = NULL, token = NULL, "updatedAt" = now()`,
            [customerId, normalizeEmail(email)],
        );
    }

    // Null when the address is already confirmed or already has a link out.
    async requestConfirmation(
        ctx: RequestContext,
        customerId: number,
        email: string,
    ): Promise<string | null> {
        const address = normalizeEmail(email);
        if (!address) return null;
        const token = randomBytes(32).toString('hex');
        const rows = await this.query(
            ctx,
            `INSERT INTO email_confirmation (uuid, "customerId", "pendingEmail", token)
             VALUES (gen_random_uuid(), $1, $2, $3)
             ON CONFLICT ("customerId") DO UPDATE
             SET "pendingEmail" = $2, token = $3, "updatedAt" = now()
             WHERE email_confirmation."confirmedEmail" IS DISTINCT FROM $2
               AND email_confirmation."pendingEmail" IS DISTINCT FROM $2
             RETURNING token`,
            [customerId, address, token],
        );
        return rows.length > 0 ? token : null;
    }

    // The token is spent by the statement that confirms, so a link works once.
    async confirmByToken(ctx: RequestContext, token: string): Promise<Row | null> {
        if (!token) return null;
        const rows = await this.query(
            ctx,
            `UPDATE email_confirmation
             SET "confirmedEmail" = "pendingEmail", "pendingEmail" = NULL, token = NULL, "updatedAt" = now()
             WHERE token = $1 AND "pendingEmail" IS NOT NULL
             RETURNING "customerId", "confirmedEmail"`,
            [token],
        );
        return rows[0] ?? null;
    }
}
