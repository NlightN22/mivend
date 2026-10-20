import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import { BranchAssignmentService, UserEnrichmentService } from '@mivend/plugin-access-control';

import { optionalErpDetails } from './counterparty-erp-details';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

interface ManagerResolution {
    assignedManagerId: string | null | undefined;
    managerErpId: string | null | undefined;
    unresolvedReason?: string;
}

const loggerCtx = 'IntegrationCounterpartyHandler';

// ERP is master for business data: assignedManagerId is written directly, bypassing
// reassignCounterpartyManager's scope check on purpose; manual overrides sit on top.
@Injectable()
export class CounterpartyStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly counterpartyService: CounterpartyService,
        private readonly userEnrichmentService: UserEnrichmentService,
        private readonly branchAssignment: BranchAssignmentService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        // Deletion tombstones carry no name. name: null must still let upsertActiveState update
        // isActive on an existing row, but never create a brand-new row with a blank name.
        const name = payload.name ? String(payload.name) : null;
        // Absent isActive means false, not true: proto3 bool zero-value omission still applies
        // in JSON encoding despite the field being declared optional bool in the .proto.
        const isActive = payload.isActive === true && payload.isDeleted !== true;

        const { assignedManagerId, managerErpId, unresolvedReason } =
            await this.resolveAssignedManagerId(entityId, ctx, payload);

        const stored = await this.branchAssignment.assignCounterpartyIfInputsChanged(
            ctx,
            entityId,
            () =>
                this.counterpartyService.upsertActiveState(ctx, entityId, {
                    name,
                    isActive,
                    // inn/group/department: absent keeps the stored value. Contact fields below are
                    // full state on a named event: absent or empty clears (#259).
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
                    legalAddress: contact(name, payload.legalAddress),
                    factualAddress: contact(name, payload.factualAddress),
                    phone: contact(name, payload.phone),
                    officialEmail: contact(name, payload.officialEmail),

                    ...optionalErpDetails(payload),
                    // notificationPhone: deliberately unread — see this file's own top-of-file field
                    // accounting comment.
                }),
        );
        if (!name) {
            Logger.verbose(
                `counterparty ${entityId}: no name (deletion tombstone) — updated active ` +
                    `state only if a row already existed, never created one`,
                loggerCtx,
            );
            return stored
                ? inboundApplied()
                : inboundNoop(`counterparty ${entityId}: nameless tombstone for an unknown row`);
        }
        Logger.verbose(`Upserted counterparty erpId=${entityId}`, loggerCtx);
        return unresolvedReason ? inboundNoop(unresolvedReason) : inboundApplied();
    }

    // Omitted manager keys must never clear an existing manager. A known but unlinked erpId
    // is not a race: don't retry, save with assignedManagerId null; the listener backfills it.
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
            // The manager is a soft reference: never hold the counterparty (or its waiting contracts)
            // for it; the id may never arrive, and assignedManagerId is backfilled on link.
            const reason = `counterparty ${entityId} saved without a manager: manager reference ${managerErpId} is not a known ERP user (it may be a user group, which is never published); assigned only if a user with this id links to an Administrator`;
            Logger.verbose(reason, loggerCtx);
            return { assignedManagerId: null, managerErpId, unresolvedReason: reason };
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

function contact(name: string | null, value: unknown): string | null | undefined {
    if (!name) return undefined;
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}
