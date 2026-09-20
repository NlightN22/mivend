import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import { UserEnrichmentService } from '@mivend/plugin-access-control';

import { MissingDependencyError } from '../types';
import type { InboundStreamHandler } from './inbound-stream-handler';

interface ManagerResolution {
    assignedManagerId: string | null | undefined;
    managerErpId: string | null | undefined;
}

const loggerCtx = 'IntegrationCounterpartyHandler';

// Applies Integration Service's `counterparty` stream (CounterpartyChanged, 1C's "Контрагент",
// company.customers.events.v1.counterparty-changed). Issue #104, verified live against
// @nlightn22/event-contracts@0.38.0 (search-platform#92/#118 — do not trust older issue comments
// claiming inn/erpGroupLabel/departmentId are unavailable; they shipped): this stream carries
// name/isActive/isDeleted/managerId(s)/inn/erpGroupLabel/departmentId — never creditLimit/
// paymentDelayDays/priceType/branchId, which stay erp-import's own richer REST record (see
// CounterpartyService.upsertActiveState's own comment). creditBalance moved to its own
// register-driven stream (search-platform#129) — see CounterpartyCreditBalanceStreamHandler.
//
// manager_id/manager_ids: issue #109 shipped the erpId↔Administrator correlation
// (UserEnrichmentService, fed by the `user` stream) this was blocked on — resolved here to
// Counterparty.assignedManagerId (a Vendure Administrator.id, never a raw 1C erpId).
//
// access-control-review note (docs/access-control.md, layer 3): this writes assignedManagerId
// directly, bypassing CounterpartyService.reassignManager's own department-scope authorization
// check — deliberate, not an oversight. Same precedent as departmentId/branchId already being
// ERP-authoritative (EmployeeService's REST path writes Administrator.customFields.departmentId
// the same way) — "ERP is master for business data" (AGENTS.md/external-integration-rules). 1C
// can silently change who holds `own`-scope access to a counterparty; the portal's own
// reassignManager mutation stays a manual override tool on top of that, not the sole path.
@Injectable()
export class CounterpartyStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly counterpartyService: CounterpartyService,
        private readonly userEnrichmentService: UserEnrichmentService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        // A deletion tombstone never carries a name — same convention confirmed for organization/
        // department. `name: null` here still lets upsertActiveState update isActive on an
        // existing row; it only refuses to fabricate a brand-new row with a blank name.
        const name = payload.name ? String(payload.name) : null;
        // Absent isActive means false, not true — see types.ts's InboundStream comment (proto3
        // bool zero-value omission — confirmed to still apply in practice for this contract
        // version's JSON encoding despite the field now being declared `optional bool` at the
        // .proto level, search-platform#110/#135). isDeleted folds in the same way every sibling
        // handler does.
        const isActive = payload.isActive === true && payload.isDeleted !== true;

        const { assignedManagerId, managerErpId } = await this.resolveAssignedManagerId(
            entityId,
            ctx,
            payload,
        );

        await this.counterpartyService.upsertActiveState(ctx, entityId, {
            name,
            isActive,
            // These are real optional-scalar fields (undefined = "1C didn't send this", distinct
            // from a proto3 zero-value ambiguity) — `in` checks presence explicitly rather than
            // reading `payload.inn` directly, since an intentional `null`/empty string must still
            // be applied, not treated as "leave unchanged".
            inn: 'inn' in payload ? ((payload.inn as string | null) ?? null) : undefined,
            erpGroupLabel:
                'erpGroupLabel' in payload
                    ? ((payload.erpGroupLabel as string | null) ?? null)
                    : undefined,
            departmentId:
                'departmentId' in payload
                    ? ((payload.departmentId as string | null) ?? null)
                    : undefined,
            assignedManagerId,
            managerErpId,
        });
        if (!name) {
            Logger.verbose(
                `counterparty ${entityId}: no name (deletion tombstone) — updated active ` +
                    `state only if a row already existed, never created one`,
                loggerCtx,
            );
            return;
        }
        Logger.verbose(`Upserted counterparty erpId=${entityId}`, loggerCtx);
    }

    // Primary manager_id wins; else the first entry of manager_ids; else `undefined` (leave
    // assignedManagerId untouched) — mirrors search-platform#92's own established fallback
    // decision, never invented on Integration Service's side. Both keys are omitted by 1C itself
    // (real optional-scalar/empty-repeated-field presence, not proto3 zero-value ambiguity) when
    // no manager is assigned at all — that case must never clear an existing REST/portal-assigned
    // manager just because this event omitted the field.
    //
    // mivend.audit.common (2026-09-20): three distinct outcomes of
    // UserEnrichmentService.findManagerLink, previously collapsed into just two (found/not
    // found) via the old findAdministratorIdByErpId, which is exactly what grew an unbounded
    // MissingDependencyError retry backlog (65k+ pending rows in staging-integration) — a
    // manager erpId that a human simply hasn't decided on yet (can take days) was retried
    // identically to a genuine cross-stream ordering race (which resolves in seconds/minutes):
    //   - `{ found: false }` — never seen this erpId at all: a real race, still retryable.
    //   - `{ found: true, administratorId: null }` — known, still unlinked: NOT a race. Do not
    //     retry; save with no manager (assignedManagerId: null) — AdministratorLinkedListener
    //     backfills it later if/when this erpId actually links.
    //   - `{ found: true, administratorId }` — linked: use it.
    private async resolveAssignedManagerId(
        entityId: string,
        ctx: RequestContext,
        payload: Record<string, unknown>,
    ): Promise<ManagerResolution> {
        const managerIds = Array.isArray(payload.managerIds)
            ? (payload.managerIds as unknown[])
            : [];
        const managerErpId = payload.managerId
            ? String(payload.managerId)
            : managerIds.length > 0
              ? String(managerIds[0])
              : undefined;
        if (managerErpId === undefined) {
            return { assignedManagerId: undefined, managerErpId: undefined };
        }

        const resolution = await this.userEnrichmentService.findManagerLink(ctx, managerErpId);
        if (!resolution.found) {
            // Ordinary eventual-consistency race (the manager's own `user` event may simply not
            // have arrived yet, Kafka gives no cross-topic ordering guarantee) — retryable, per
            // external-integration-rules's "Cross-entity dependencies" section. Never silently
            // skip: that would permanently drop the manager assignment the moment this event
            // happens to arrive before the manager's own `user` event.
            throw new MissingDependencyError(
                `counterparty ${entityId}: manager erpId=${managerErpId} has no linked Administrator yet`,
            );
        }
        if (resolution.administratorId === null) {
            Logger.verbose(
                `counterparty ${entityId}: manager erpId=${managerErpId} is known but not yet linked to an Administrator — saving with no manager, not retrying`,
                loggerCtx,
            );
            return { assignedManagerId: null, managerErpId };
        }
        return { assignedManagerId: String(resolution.administratorId), managerErpId };
    }
}
