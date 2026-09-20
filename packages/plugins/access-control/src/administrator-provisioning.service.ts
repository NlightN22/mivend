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

// Issue #119, Decision 3: human-triggered creation, anchored on erpId from the moment of
// creation — never re-derived by email matching afterwards. The only creation path; the Kafka
// stream (UserEnrichmentService) never creates an Administrator, only enriches/links one that
// already exists.
@Injectable()
export class AdministratorProvisioningService {
    constructor(
        private administratorService: AdministratorService,
        private userService: UserService,
        private eventBus: EventBus,
        private erpUserService: ErpUserService,
        private connection: TransactionalConnection,
    ) {}

    // Decision 4: zero roles at creation — the Administrator exists but can perform no action
    // until a human assigns role(s) via the existing updateAdministratorRole mutation.
    //
    // Decision 3, step 1-2: `AdministratorService.create` requires *some* password (there is no
    // no-password creation path for Administrator, unlike Customer) — this generates a random
    // value that is never surfaced, logged, or returned, immediately invalidates it with a
    // password-reset token, and publishes the same PasswordResetEvent the Customer reset flow
    // uses, so the already-registered `passwordResetHandler` (@vendure/email-plugin) delivers the
    // link — no plaintext password ever reaches a human, staff included.
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

        // mivend.audit.common (2026-09-20): flips the row to linked in place — never deletes it
        // (see ErpUserService.markLinked's own comment). Publishing AdministratorLinkedEvent
        // lets plugin-counterparty backfill any Counterparty left with no manager while this
        // erpId was still unlinked.
        await this.erpUserService.markLinked(ctx, erpId, admin.id);
        await this.eventBus.publish(new AdministratorLinkedEvent(ctx, erpId, admin.id));

        await this.sendPasswordResetLink(ctx, pending.email);

        return admin;
    }

    // Issue #119: neither native Dashboard nor manager-portal Administrators screens have a
    // "resend password reset" action — the only place a reset link was ever sent from was
    // createFromPending, at creation time. This reuses that same token/event mechanism for an
    // Administrator who already exists (lost/expired the original link, or the mailbox that
    // devMode's own email test-mailbox is not a substitute for a person actually checking).
    async resendPasswordReset(ctx: RequestContext, administratorId: string): Promise<void> {
        const admin = await this.administratorService.findOne(ctx, administratorId);
        if (!admin) {
            throw new Error(`No Administrator found for id=${administratorId}`);
        }
        await this.sendPasswordResetLink(ctx, admin.emailAddress);
    }

    // Issue #119: the /set-password page has no session and nothing else to identify whose
    // password it's about to change — this lets it show a name before (and after) submission,
    // for a person to sanity-check "is this actually my account" before setting a password.
    // Deliberately does not validate/consume the token (unlike resetPasswordByToken) — it's a
    // read-only lookup, shown on the expired/invalid states too, not just the form.
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

    // Issue #119 Phase 2: completes the reset-link flow started by createFromPending above (also
    // reused for any later "reset this Administrator's password" staff action, per the issue's
    // Decision 3 step 3). `resetPasswordByToken` is a generic User-level method (verified in
    // @vendure/core source, not Customer-specific) — the only auth this endpoint has is
    // possession of a valid, unexpired, single-use token, not RBAC, since the caller has no
    // session yet (see the resolver's `@Allow(Permission.Public)`). Its error variants
    // (PasswordResetTokenExpiredError/PasswordResetTokenInvalidError/PasswordValidationError)
    // aren't part of @vendure/core's public export surface, so they're distinguished here by
    // `__typename` rather than an `instanceof` check.
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
