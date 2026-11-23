import { createHash, randomBytes } from 'crypto';

import { Injectable } from '@nestjs/common';
import { Customer, RequestContext, TransactionalConnection } from '@vendure/core';

import { lockAggregates } from 'shared';

import { EmailConfirmation } from './entities/email-confirmation.entity';

export const normalizeEmail = (email: string | null | undefined): string | null =>
    email?.trim().toLowerCase() || null;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

interface Row {
    customerId: number;
    confirmedEmail: string | null;
    pendingEmail?: string | null;
    userId?: number | null;
}

// Single statements need no lock; confirmByToken locks its row and the address (docs/concurrency.md).
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

    // Null when this address is already pending; the stored token is a hash. A new request replaces the old link.
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
             WHERE email_confirmation."pendingEmail" IS DISTINCT FROM $2
             RETURNING "pendingEmail"`,
            [customerId, address, hashToken(token)],
        );
        return rows[0]?.pendingEmail ? token : null;
    }

    async clearPending(ctx: RequestContext, customerId: number): Promise<boolean> {
        const rows = await this.query(
            ctx,
            `UPDATE email_confirmation SET "pendingEmail" = NULL, token = NULL, "updatedAt" = now()
             WHERE "customerId" = $1 AND "pendingEmail" IS NOT NULL RETURNING "customerId"`,
            [customerId],
        );
        return rows.length > 0;
    }

    // The customer row goes through the repository so the change journal sees it; the rest is raw.
    // Applies the pending address to the customer and the sign-in under the row lock; a clash with another account fails closed.
    async confirmByToken(ctx: RequestContext, token: string): Promise<Row | null> {
        if (!token) return null;
        return this.connection.withTransaction(ctx, async txCtx => {
            const [held] = await this.query(
                txCtx,
                `SELECT ec."customerId", ec."pendingEmail", c."userId" AS "userId"
                 FROM email_confirmation ec JOIN customer c ON c.id = ec."customerId"
                 WHERE ec.token = $1 AND ec."pendingEmail" IS NOT NULL FOR UPDATE OF ec`,
                [hashToken(token)],
            );
            const address = held?.pendingEmail;
            if (!held || !address) return null;
            await lockAggregates(this.connection, txCtx, [`email-address:${address}`]);
            const clash = await this.query(
                txCtx,
                `SELECT 1 FROM customer WHERE id <> $1 AND "deletedAt" IS NULL
                   AND lower(btrim("emailAddress")) = $2
                 UNION ALL
                 SELECT 1 FROM "user" WHERE ($3::int IS NULL OR id <> $3) AND "deletedAt" IS NULL
                   AND lower(btrim(identifier)) = $2`,
                [held.customerId, address, held.userId ?? null],
            );
            if (clash.length > 0) return null;
            const customers = this.connection.getRepository(txCtx, Customer);
            const customer = await customers.findOneBy({ id: held.customerId });
            if (!customer) return null;
            customer.emailAddress = address;
            await customers.save(customer, { reload: false });
            if (held.userId) {
                await this.query(txCtx, `UPDATE "user" SET identifier = $2 WHERE id = $1`, [
                    held.userId,
                    address,
                ]);
                await this.query(
                    txCtx,
                    `UPDATE authentication_method SET identifier = $2
                     WHERE "userId" = $1 AND type = 'NativeAuthenticationMethod'`,
                    [held.userId, address],
                );
            }
            const [done] = await this.query(
                txCtx,
                `UPDATE email_confirmation
                 SET "confirmedEmail" = $2, "pendingEmail" = NULL, token = NULL, "updatedAt" = now()
                 WHERE "customerId" = $1 RETURNING "customerId", "confirmedEmail"`,
                [held.customerId, address],
            );
            return done ?? null;
        });
    }
}
