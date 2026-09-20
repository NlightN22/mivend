import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
    Administrator,
    AdministratorService,
    EventBus,
    PasswordResetEvent,
    RequestContext,
    UserService,
} from '@vendure/core';

import { PendingErpUserService } from './pending-erp-user.service';

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
        private pendingErpUserService: PendingErpUserService,
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
        const pending = await this.pendingErpUserService.findByErpId(ctx, erpId);
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

        await this.pendingErpUserService.deleteByErpId(ctx, erpId);

        const user = await this.userService.setPasswordResetToken(ctx, pending.email);
        if (user) {
            await this.eventBus.publish(new PasswordResetEvent(ctx, user));
        }

        return admin;
    }
}
