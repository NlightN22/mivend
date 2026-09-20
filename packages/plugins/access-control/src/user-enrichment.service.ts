import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { Administrator, Logger, RequestContext, TransactionalConnection } from '@vendure/core';

import { AdministratorActivationService } from './administrator-activation.service';
import { PendingErpUserService } from './pending-erp-user.service';
import { loggerCtx } from './types';

export interface UserEnrichmentInput {
    erpId: string;
    // `undefined` (the stream omitted the field) means "leave unchanged"; `null` (1C explicitly
    // cleared it) is applied like any other real value. Distinct meanings, see
    // UserStreamHandler's own comment.
    email?: string | null;
    departmentId?: string | null;
    // Issue #119: only meaningful once an Administrator is linked (AdministratorActivationService
    // no-ops otherwise) — never used to decide whether to create/keep a PendingErpUser row.
    fullName?: string | null;
    isActive?: boolean;
}

// Issue #109: correlates Integration Service's `user` Kafka stream (UserChanged, 1C's
// "Пользователи") with an existing Vendure `Administrator` — enrichment-only, never creates an
// Administrator (account provisioning stays manual, same rule EmployeeService's own comment
// already establishes for the REST path). On first sight of an erpId with no existing link,
// matches by email (same rule EmployeeService.upsert already uses) and persists erpId onto
// Administrator.customFields for idempotent re-processing on every later event — no more email
// lookups needed once linked, so a later rename in 1C's own full_name/email never breaks the
// correlation.
//
// Written via a raw repo save, not AdministratorService.update() — the latter enforces Vendure's
// own RBAC internally against the caller's RequestContext (see EmployeeService's own comment,
// which has to elevate to a SuperAdmin system context to get past it), and
// IntegrationInboxProcessorService's ctx is an unauthenticated admin-api context by design (same
// as the ctx every sibling stream handler in erp-integration already receives) — mirrors how
// DepartmentService/CounterpartyService write their own entities directly rather than through a
// higher-level service+events API.
@Injectable()
export class UserEnrichmentService {
    constructor(
        private connection: TransactionalConnection,
        private pendingErpUserService: PendingErpUserService,
        private administratorActivationService: AdministratorActivationService,
    ) {}

    async linkAndEnrich(
        ctx: RequestContext,
        input: UserEnrichmentInput,
    ): Promise<Administrator | null> {
        const repo = this.connection.getRepository(ctx, Administrator);
        let admin = await this.findByErpId(ctx, input.erpId);
        if (!admin) {
            if (!input.email) {
                Logger.verbose(
                    `user ${input.erpId}: no Administrator linked yet and no email to match by, skipping`,
                    loggerCtx,
                );
                await this.pendingErpUserService.upsert(ctx, {
                    erpId: input.erpId,
                    fullName: input.fullName,
                    email: input.email,
                    departmentId: input.departmentId,
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
                await this.pendingErpUserService.upsert(ctx, {
                    erpId: input.erpId,
                    fullName: input.fullName,
                    email: input.email,
                    departmentId: input.departmentId,
                });
                return null;
            }
            admin.customFields = { ...admin.customFields, erpId: input.erpId };
            await this.pendingErpUserService.deleteByErpId(ctx, input.erpId);
            Logger.verbose(
                `Linked administrator ${input.email} to erpId=${input.erpId}`,
                loggerCtx,
            );
        }
        if (input.departmentId !== undefined) {
            admin.customFields = { ...admin.customFields, departmentId: input.departmentId };
        }
        const saved = await repo.save(admin);
        if (input.isActive !== undefined) {
            await this.administratorActivationService.syncFromErp(ctx, input.erpId, input.isActive);
        }
        return saved;
    }

    // Issue #104's managerId chain: resolves a 1C User erpId (CounterpartyChanged.manager_id/
    // manager_ids) to the Vendure Administrator.id it was linked to above. Returns null when no
    // Administrator has been linked yet — an ordinary eventual-consistency race (the `user` event
    // for that manager may simply not have arrived yet), not a permanent absence; the caller
    // (CounterpartyStreamHandler) is responsible for treating that as a retryable
    // MissingDependencyError, not a silent skip — see external-integration-rules's "Cross-entity
    // dependencies" section.
    async findAdministratorIdByErpId(ctx: RequestContext, erpId: string): Promise<ID | null> {
        const admin = await this.findByErpId(ctx, erpId);
        return admin ? admin.id : null;
    }

    // Standard TypeORM embedded-column query against Vendure's config-driven customFields
    // (translates to a plain `WHERE "customFieldsErpid" = $1`) — not covered by an integration
    // test against a real bootstrapped Vendure DataSource in this change (access-control-review,
    // 2026-09-20): the codebase's existing component-test pattern only spins up a raw TypeORM
    // schema for plugin-owned entities, and a full e2e Vendure bootstrap just to verify this one
    // query's syntax would be disproportionate to this change. Flagged as a deliberate, reported
    // gap rather than silently skipped — verify manually against a real DB if this ever misbehaves.
    // `withDeleted: true` — the correlation must still resolve after AdministratorActivationService
    // soft-deletes the linked Administrator, otherwise a later reactivation event would find "no
    // Administrator" and incorrectly fall back to the email-match/PendingErpUser path instead of
    // reactivating the existing one.
    private async findByErpId(ctx: RequestContext, erpId: string): Promise<Administrator | null> {
        const repo = this.connection.getRepository(ctx, Administrator);
        return repo.findOne({ where: { customFields: { erpId } }, withDeleted: true });
    }
}
