import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
    Administrator,
    AdministratorService,
    EventBus,
    PasswordResetEvent,
    RequestContext,
    TransactionalConnection,
    User,
    UserService,
} from '@vendure/core';

import { AdministratorLinkedEvent } from './administrator-linked.event';
import { ErpUserService } from './erp-user.service';

// Only creation path: the Kafka stream (UserEnrichmentService) never creates an Administrator,
// only enriches or links an existing one. Anchored on erpId, never re-derived by email matching.
@Injectable()
export class AdministratorProvisioningService {
    constructor(
        private administratorService: AdministratorService,
        private userService: UserService,
        private eventBus: EventBus,
        private erpUserService: ErpUserService,
        private connection: TransactionalConnection,
    ) {}

    // Created with zero roles and a random, never-surfaced password (create requires one).
    // Invalidated by a reset token; the reset email is the only way in, so no human sees a password.
    async createFromPending(ctx: RequestContext, erpId: string): Promise<Administrator> {
        const pending = await this.erpUserService.findByErpId(ctx, erpId);
        if (!pending) {
            throw new Error(
                `No pending ERP user found for erpId=${erpId} — already linked, or never seen`,
            );
        }
        if (!pending.email) {
            throw new Error(
                `Pending ERP user erpId=${erpId} has no email address — cannot create a login without one`,
            );
        }
        const [firstName, ...rest] = (pending.fullName ?? pending.email).trim().split(/\s+/);
        const throwawayPassword = randomBytes(32).toString('hex');

        const admin = await this.administratorService.create(ctx, {
            emailAddress: pending.email,
            firstName: firstName || pending.email,
            lastName: rest.join(' ') || '-',
            password: throwawayPassword,
            roleIds: [],
            customFields: { erpId, departmentId: pending.departmentId },
        });

        // Row is flipped to linked in place, never deleted; see ErpUserService.markLinked.
        // The event backfills any Counterparty left without a manager while this erpId was unlinked.
        await this.erpUserService.markLinked(ctx, erpId, admin.id);
        await this.eventBus.publish(new AdministratorLinkedEvent(ctx, erpId, admin.id));

        await this.sendPasswordResetLink(ctx, pending.email);

        return admin;
    }

    // No UI action resends a reset link for an existing Administrator; createFromPending is the only sender.
    // Reuses that token and event; devMode's test mailbox does not substitute for real delivery.
    async resendPasswordReset(ctx: RequestContext, administratorId: string): Promise<void> {
        const admin = await this.administratorService.findOne(ctx, administratorId);
        if (!admin) {
            throw new Error(`No Administrator found for id=${administratorId}`);
        }
        await this.sendPasswordResetLink(ctx, admin.emailAddress);
    }

    // The /set-password page has no session, so this read-only lookup shows whose account it is.
    // Does not consume the token (unlike resetPasswordByToken); also shown on expired/invalid states.
    async findAdministratorByResetToken(
        ctx: RequestContext,
        token: string,
    ): Promise<{ firstName: string; lastName: string; emailAddress: string } | null> {
        const user = await this.connection
            .getRepository(ctx, User)
            .createQueryBuilder('user')
            .leftJoin('user.authenticationMethods', 'authenticationMethod')
            .where('authenticationMethod.passwordResetToken = :token', { token })
            .getOne();
        if (!user) {
            return null;
        }
        const admin = await this.administratorService.findOneByUserId(ctx, user.id);
        if (!admin) {
            return null;
        }
        return {
            firstName: admin.firstName,
            lastName: admin.lastName,
            emailAddress: admin.emailAddress,
        };
    }

    private async sendPasswordResetLink(ctx: RequestContext, emailAddress: string): Promise<void> {
        const user = await this.userService.setPasswordResetToken(ctx, emailAddress);
        if (user) {
            await this.eventBus.publish(new PasswordResetEvent(ctx, user));
        }
    }

    // Auth is possession of a valid, unexpired, single-use token only (no session, so no RBAC).
    // Error variants aren't exported from @vendure/core, so match on __typename, not instanceof.
    async completePasswordReset(
        ctx: RequestContext,
        token: string,
        password: string,
    ): Promise<
        { success: true } | { success: false; reason: 'expired' | 'invalid' | 'validation' }
    > {
        const result = await this.userService.resetPasswordByToken(ctx, token, password);
        if ('identifier' in result) {
            return { success: true };
        }
        switch (result.__typename) {
            case 'PasswordResetTokenExpiredError':
                return { success: false, reason: 'expired' };
            case 'PasswordValidationError':
                return { success: false, reason: 'validation' };
            default:
                return { success: false, reason: 'invalid' };
        }
    }
}
