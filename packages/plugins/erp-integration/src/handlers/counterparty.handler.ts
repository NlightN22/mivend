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

// Applies Integration Service's `counterparty` stream (CounterpartyChanged, the ERP's "Контрагент",
// company.customers.events.v1.counterparty-changed). Issue #104, re-verified live against
// @nlightn22/event-contracts@0.39.0 (issue #131 — do not trust older issue comments claiming a
// field is unavailable; check the current .d.ts fresh each time, per external-integration-rules).
// Full current field-by-field accounting for this message (envelope fields event_id/occurred_at/
// entity_id/version/updated_at are handled generically by KafkaConsumerService, not listed here):
//   - name/isActive/isDeleted/managerId(s)/inn/erpGroupLabel/departmentId — consumed, see below.
//   - legalAddress (field 15, pre-existing since before this bump) — consumed (issue #131):
//     display/completeness per #120's Decision 1, not an activation gate.
//   - factualAddress/phone/officialEmail (fields 17/18/20, new in 0.39.0) — consumed (issue
//     #131): phone+officialEmail unblock #120's portal-access activation (Decision 1/2);
//     factualAddress is display/completeness only, same status as legalAddress.
//   - notificationPhone (field 19, new in 0.39.0) — deliberately NOT consumed. Confirmed a
//     genuinely separate ERP fact from `phone` (not the same field read two ways, see #120's
//     Decision 3 investigation), but #120's Decision 1/2 only need phone+officialEmail for
//     activation and no other mivend feature reads it yet. Revisit if a real consumer appears.
//   - creditLimit/paymentDelayDays/priceType/branchId are never carried on this stream at all —
//     they stay erp-import's own richer REST record (see CounterpartyService.upsertActiveState's
//     own comment). creditBalance moved to its own register-driven stream (search-platform#129)
//     — see CounterpartyCreditBalanceStreamHandler.
//
// manager_id/manager_ids: issue #109 shipped the erpId↔Administrator correlation
// (UserEnrichmentService, fed by the `user` stream) this was blocked on — resolved here to
// Counterparty.assignedManagerId (a Vendure Administrator.id, never a raw ERP erpId).
//
// Writes assignedManagerId directly, bypassing the reassignCounterpartyManager scope check on
// purpose: ERP is master for business data; the mutation is a manual override on top.
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
            // These are real optional-scalar fields (undefined = "the ERP didn't send this", distinct
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
            legalAddress:
                'legalAddress' in payload
                    ? ((payload.legalAddress as string | null) ?? null)
                    : undefined,
            factualAddress:
                'factualAddress' in payload
                    ? ((payload.factualAddress as string | null) ?? null)
                    : undefined,
            phone: 'phone' in payload ? ((payload.phone as string | null) ?? null) : undefined,
            officialEmail:
                'officialEmail' in payload
                    ? ((payload.officialEmail as string | null) ?? null)
                    : undefined,
            // notificationPhone: deliberately unread — see this file's own top-of-file field
            // accounting comment.
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
    // decision, never invented on Integration Service's side. Both keys are omitted by the ERP itself
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
