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
import { ErpUserService } from './erp-user.service';
import { loggerCtx } from './types';

export interface UserEnrichmentInput {
    erpId: string;
    // `undefined` (the stream omitted the field) means "leave unchanged"; `null` (1C explicitly
    // cleared it) is applied like any other real value. Distinct meanings, see
    // UserStreamHandler's own comment.
    email?: string | null;
    departmentId?: string | null;
    // Issue #119: only meaningful once an Administrator is linked (AdministratorActivationService
    // no-ops otherwise) — never used to decide whether to create/keep an ErpUser row.
    fullName?: string | null;
    isActive?: boolean;
}

// Result of resolving a 1C User erpId to whatever this system currently knows about it — see
// findManagerLink's own doc comment for how counterparty.handler.ts (and any future
// manager-erpId-dependent handler) must interpret each case.
export type ManagerLinkResolution = { found: false } | { found: true; administratorId: ID | null };

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
        private erpUserService: ErpUserService,
        private administratorActivationService: AdministratorActivationService,
        private eventBus: EventBus,
    ) {}

    async linkAndEnrich(
        ctx: RequestContext,
        input: UserEnrichmentInput,
    ): Promise<Administrator | null> {
        const repo = this.connection.getRepository(ctx, Administrator);
        let admin = await this.findByErpId(ctx, input.erpId);
        if (!admin) {
            if (input.isActive === false) {
                // 1C already reports this user as inactive/deleted — never surface it as a
                // "create Administrator" candidate (confirmed live: issue #119 follow-up — a
                // deleted 1C user was showing up in Pending ERP users with a working "Create
                // Administrator" button). The row itself is kept (mivend.audit.common,
                // 2026-09-20 — deleting it made counterparty.handler.ts unable to tell "never
                // seen" from "known, will never link"), just flagged `active: false` so
                // ErpUserService.findAllPaginated excludes it from the Pending list.
                await this.erpUserService.upsert(ctx, {
                    erpId: input.erpId,
                    fullName: input.fullName,
                    email: input.email,
                    departmentId: input.departmentId,
                    active: false,
                });
                Logger.verbose(
                    `user ${input.erpId}: inactive/deleted in 1C, not queued as a pending candidate`,
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
                    active: input.isActive,
                });
                return null;
            }
            admin.customFields = { ...admin.customFields, erpId: input.erpId };
            const saved = await repo.save(admin);
            await this.erpUserService.markLinked(ctx, input.erpId, saved.id);
            await this.eventBus.publish(new AdministratorLinkedEvent(ctx, input.erpId, saved.id));
            Logger.verbose(
                `Linked administrator ${input.email} to erpId=${input.erpId}`,
                loggerCtx,
            );
            admin = saved;
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
    // manager_ids) against the ErpUser table — see mivend.audit.common's 2026-09-20 diagnosis of
    // the `counterparty` stream inbox backlog this replaces `findAdministratorIdByErpId` for.
    // Three distinct cases the caller (CounterpartyStreamHandler) must handle differently:
    //   - `{ found: false }` — no ErpUser row at all for this erpId: a genuine, ordinary
    //     eventual-consistency race (the `user` event for that manager may simply not have
    //     arrived yet). Retryable — the caller should throw MissingDependencyError.
    //   - `{ found: true, administratorId: null }` — known, still `unlinked`: NOT a race. A
    //     human hasn't decided whether this 1C user becomes an Administrator, which can take
    //     days, not seconds — retrying it as a race grows an unbounded inbox backlog (the actual
    //     incident this fixes: 65k+ pending counterparty-stream retries in staging-integration).
    //     The caller must save with no manager assigned and must NOT retry.
    //   - `{ found: true, administratorId }` — linked: use this id.
    async findManagerLink(ctx: RequestContext, erpId: string): Promise<ManagerLinkResolution> {
        const erpUser = await this.erpUserService.findByErpId(ctx, erpId);
        if (!erpUser) return { found: false };
        return { found: true, administratorId: erpUser.administratorId };
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
    // Administrator" and incorrectly fall back to the email-match/ErpUser path instead of
    // reactivating the existing one.
    private async findByErpId(ctx: RequestContext, erpId: string): Promise<Administrator | null> {
        const repo = this.connection.getRepository(ctx, Administrator);
        return repo.findOne({ where: { customFields: { erpId } }, withDeleted: true });
    }
}
