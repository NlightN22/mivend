import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    AccountRegistrationEvent,
    Customer,
    CustomerService,
    EventBus,
    Logger,
    RequestContext,
    TransactionalConnection,
    UserService,
} from '@vendure/core';
import { ctxQuery } from 'shared';

import { loggerCtx } from './types';

export interface RevokedLogin {
    customerId: ID;
    userId: ID;
    emailAddress: string;
}

const normalized = (email: string): string => email.trim().toLowerCase();

// Restore only while the old login still is the contact e-mail and nobody else holds that e-mail now.
export function canRestoreLogin(
    login: RevokedLogin | null,
    chosenEmail: string,
    emailHeldByLiveAccount: boolean,
): login is RevokedLogin {
    return (
        login !== null &&
        normalized(login.emailAddress) === normalized(chosenEmail) &&
        !emailHeldByLiveAccount
    );
}

// Re-granting access brings back the revoked login so orders, addresses and history stay (#375).
@Injectable()
export class CounterpartyPortalRestoreService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private userService: UserService,
        private eventBus: EventBus,
    ) {}

    // Null when a new login has to be created. Call under the counterparty's portal-access lock.
    async restore(
        ctx: RequestContext,
        counterpartyId: ID,
        chosenEmail: string,
    ): Promise<Customer | null> {
        const login = await this.latestRevokedLogin(ctx, counterpartyId);
        if (!login) return null;
        const held = await this.emailHeldByLiveAccount(ctx, login);
        if (!canRestoreLogin(login, chosenEmail, held)) return null;

        await ctxQuery(
            this.connection,
            ctx,
            `UPDATE customer SET "deletedAt" = NULL WHERE id = $1`,
            [login.customerId],
        );
        // The old sign-in history goes with the old password, so the portal state is invited again.
        await ctxQuery(
            this.connection,
            ctx,
            `UPDATE "user" SET "deletedAt" = NULL, "lastLogin" = NULL WHERE id = $1`,
            [login.userId],
        );
        // The old password is dropped: the contact sets a new one from the mail.
        await ctxQuery(
            this.connection,
            ctx,
            `UPDATE authentication_method SET "passwordHash" = '', "passwordResetToken" = NULL
             WHERE "userId" = $1 AND type = 'NativeAuthenticationMethod'`,
            [login.userId],
        );
        const user = await this.userService.getUserById(ctx, login.userId);
        if (!user) return null;
        await this.userService.setVerificationToken(ctx, user);
        await this.eventBus.publish(new AccountRegistrationEvent(ctx, user));
        Logger.verbose(
            `Restored portal login customer=${login.customerId} for counterparty=${counterpartyId}`,
            loggerCtx,
        );
        return (await this.customerService.findOne(ctx, login.customerId)) ?? null;
    }

    private async latestRevokedLogin(
        ctx: RequestContext,
        counterpartyId: ID,
    ): Promise<RevokedLogin | null> {
        const rows = await ctxQuery<RevokedLogin[]>(
            this.connection,
            ctx,
            `SELECT cu.id AS "customerId", cu."userId" AS "userId", cu."emailAddress" AS "emailAddress"
             FROM customer cu
             WHERE cu."customFieldsCounterpartyid"::text = $1 AND cu."deletedAt" IS NOT NULL
               AND cu."userId" IS NOT NULL
             ORDER BY cu."deletedAt" DESC, cu.id DESC LIMIT 1`,
            [String(counterpartyId)],
        );
        return rows[0] ?? null;
    }

    private async emailHeldByLiveAccount(
        ctx: RequestContext,
        login: RevokedLogin,
    ): Promise<boolean> {
        const rows = await ctxQuery<unknown[]>(
            this.connection,
            ctx,
            `SELECT 1 FROM customer cu WHERE lower(cu."emailAddress") = lower($1)
               AND cu."deletedAt" IS NULL AND cu.id <> $2
             UNION ALL
             SELECT 1 FROM "user" u WHERE lower(u.identifier) = lower($1)
               AND u."deletedAt" IS NULL AND u.id <> $3
             LIMIT 1`,
            [login.emailAddress, login.customerId, login.userId],
        );
        return rows.length > 0;
    }
}
