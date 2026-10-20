import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Administrator,
    EventBus,
    Logger,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import { AdministratorActivationService } from './administrator-activation.service';
import { AdministratorLinkedEvent } from './administrator-linked.event';
import { BranchAssignmentService } from './branch-assignment.service';
import { ErpUserService } from './erp-user.service';
import { loggerCtx } from './types';

export interface UserEnrichmentInput {
    erpId: string;
    // undefined means the stream omitted the field, so leave it unchanged;
    // null means ERP explicitly cleared it and must be applied like any value.
    email?: string | null;
    departmentId?: string | null;
    positionErpId?: string | null;
    // Issue #119: only meaningful once an Administrator is linked (AdministratorActivationService
    // no-ops otherwise) — never used to decide whether to create/keep an ErpUser row.
    fullName?: string | null;
    isActive?: boolean;
}

// Each case here has a distinct caller obligation; see findManagerLink's doc for how
// counterparty.handler.ts and manager-erpId-dependent handlers must interpret them.
export type ManagerLinkResolution = { found: false } | { found: true; administratorId: ID | null };

// Enrichment only: never creates an Administrator. Email-matched once, then linked by erpId.
// Raw repo save: AdministratorService.update enforces RBAC against this unauthenticated ctx.
@Injectable()
export class UserEnrichmentService {
    constructor(
        private connection: TransactionalConnection,
        private erpUserService: ErpUserService,
        private administratorActivationService: AdministratorActivationService,
        private eventBus: EventBus,
        private branchAssignment: BranchAssignmentService,
    ) {}

    async linkAndEnrich(
        ctx: RequestContext,
        input: UserEnrichmentInput,
    ): Promise<Administrator | null> {
        const admin = await this.enrich(ctx, input);
        if (input.departmentId !== undefined) {
            await this.branchAssignment.assignCounterparties(ctx, { managerErpId: input.erpId });
        }
        return admin;
    }

    private async enrich(
        ctx: RequestContext,
        input: UserEnrichmentInput,
    ): Promise<Administrator | null> {
        const repo = this.connection.getRepository(ctx, Administrator);
        let admin = await this.findByErpId(ctx, input.erpId);
        const linkedNow = !admin;
        if (!admin) {
            if (input.isActive === false) {
                // Inactive rows are flagged active: false, not deleted: the counterparty handler must
                // tell "never seen" apart from "known, will never link"; the Pending list filters them.
                await this.erpUserService.upsert(ctx, {
                    erpId: input.erpId,
                    fullName: input.fullName,
                    email: input.email,
                    departmentId: input.departmentId,
                    positionErpId: input.positionErpId,
                    active: false,
                });
                Logger.verbose(
                    `user ${input.erpId}: inactive/deleted in the ERP, not queued as a pending candidate`,
                    loggerCtx,
                );
                return null;
            }
            if (!input.email) {
                Logger.verbose(
                    `user ${input.erpId}: no Administrator linked yet and no email to match by, skipping`,
                    loggerCtx,
                );
                await this.erpUserService.upsert(ctx, {
                    erpId: input.erpId,
                    fullName: input.fullName,
                    email: input.email,
                    departmentId: input.departmentId,
                    positionErpId: input.positionErpId,
                    active: input.isActive,
                });
                return null;
            }
            admin = await repo.findOne({ where: { emailAddress: input.email } });
            if (!admin) {
                Logger.warn(
                    `No Administrator found for user email "${input.email}" (erpId=${input.erpId}) — skipping. Administrator accounts are provisioned manually, not created by this stream.`,
                    loggerCtx,
                );
                // Issue #119: surfaced as a candidate for a human to review/create manually —
                // never auto-created here.
                await this.erpUserService.upsert(ctx, {
                    erpId: input.erpId,
                    fullName: input.fullName,
                    email: input.email,
                    departmentId: input.departmentId,
                    positionErpId: input.positionErpId,
                    active: input.isActive,
                });
                return null;
            }
            admin.customFields = { ...admin.customFields, erpId: input.erpId };
            await repo.update(admin.id, { customFields: { erpId: input.erpId } });
            await this.erpUserService.markLinked(ctx, input.erpId, admin.id, input.positionErpId);
            await this.eventBus.publish(new AdministratorLinkedEvent(ctx, input.erpId, admin.id));
            Logger.verbose(
                `Linked administrator ${input.email} to erpId=${input.erpId}`,
                loggerCtx,
            );
        }
        // Writes only the keys this stream owns: a spread of the loaded customFields would revert a concurrent change to others.
        if (input.departmentId !== undefined) {
            admin.customFields = { ...admin.customFields, departmentId: input.departmentId };
            await repo.update(admin.id, { customFields: { departmentId: input.departmentId } });
        }
        if (linkedNow || input.departmentId !== undefined) {
            await this.branchAssignment.assignAdministrator(ctx, admin.id);
        }
        if (!linkedNow && input.positionErpId !== undefined) {
            await this.erpUserService.setPositionIfExists(ctx, input.erpId, input.positionErpId);
        }
        if (input.isActive !== undefined) {
            await this.administratorActivationService.syncFromErp(ctx, input.erpId, input.isActive);
        }
        return admin;
    }

    // found:false is a real eventual-consistency race (user event may not have arrived): retry.
    // null administratorId = unlinked, a human decision taking days: never retry, save unassigned.
    async findManagerLink(ctx: RequestContext, erpId: string): Promise<ManagerLinkResolution> {
        const erpUser = await this.erpUserService.findByErpId(ctx, erpId);
        if (!erpUser) return { found: false };
        return { found: true, administratorId: erpUser.administratorId };
    }

    // withDeleted: true so a soft-deleted Administrator still resolves, else reactivation
    // falls back to email matching. No integration test covers this query: verify on a real DB.
    private async findByErpId(ctx: RequestContext, erpId: string): Promise<Administrator | null> {
        const repo = this.connection.getRepository(ctx, Administrator);
        return repo.findOne({ where: { customFields: { erpId } }, withDeleted: true });
    }
}
