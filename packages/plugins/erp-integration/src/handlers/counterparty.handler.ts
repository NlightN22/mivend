import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import {
    ContactPointService,
    CounterpartyErpMirrorService,
    CounterpartyStreamStateService,
    CounterpartyTeamService,
    ErpContactPersonService,
} from '@mivend/plugin-counterparty';
import type { ActiveStateFields } from '@mivend/plugin-counterparty';
import { BranchAssignmentService, UserEnrichmentService } from '@mivend/plugin-access-control';

import { resolveManagers } from './counterparty-manager-resolution';
import { optionalErpDetails } from './counterparty-erp-details';
import { mirrorFields } from './counterparty-mirror-fields';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationCounterpartyHandler';

// The first event of a counterparty seeds mivend's record (and its team); afterwards only the ERP-owned
// fields move (counterparty-ownership.ts). Every event lands in the counterparty_erp mirror.
@Injectable()
export class CounterpartyStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly streamState: CounterpartyStreamStateService,
        private readonly userEnrichmentService: UserEnrichmentService,
        private readonly branchAssignment: BranchAssignmentService,
        private readonly contactPoints: ContactPointService,
        private readonly persons: ErpContactPersonService,
        private readonly mirror: CounterpartyErpMirrorService,
        private readonly team: CounterpartyTeamService,
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

        const { assignedManagerId, managerErpId, teamAdministratorIds, unresolvedReason } =
            await resolveManagers(this.userEnrichmentService, entityId, ctx, payload);
        const fields: ActiveStateFields = {
            name,
            isActive,
            // Absent keeps the stored value. Address, phone, e-mail and channels come from the
            // contact-info stream; the group label and department are no longer sent.
            inn: 'inn' in payload ? ((payload.inn as string | null) ?? null) : undefined,
            assignedManagerId,
            managerErpId,
            ...optionalErpDetails(payload),
        };
        if (name) {
            await this.mirror.write(ctx, entityId, mirrorFields(fields, payload.managerIds));
        }

        const stored = await this.branchAssignment.assignCounterpartyIfInputsChanged(
            ctx,
            entityId,
            () =>
                this.streamState.upsertActiveState(
                    ctx,
                    entityId,
                    fields,
                    async (txCtx, created) => {
                        await this.team.seedFromErp(txCtx, created.id, teamAdministratorIds);
                    },
                ),
        );
        const failure = name
            ? await this.contactPoints.guarded(ctx, `counterparty ${entityId}`, async () => {
                  await this.mirror.seedContactFromMirror(ctx, entityId);
                  await this.persons.linkWaitingContacts(ctx, entityId);
              })
            : null;
        if (!name) {
            Logger.verbose(
                `counterparty ${entityId}: no name (deletion tombstone) — updated active ` +
                    `state only if a row already existed, never created one`,
                loggerCtx,
            );
            return stored
                ? inboundApplied(undefined, failure)
                : inboundNoop(`counterparty ${entityId}: nameless tombstone for an unknown row`);
        }
        Logger.verbose(`Upserted counterparty erpId=${entityId}`, loggerCtx);
        return unresolvedReason
            ? inboundNoop(failure ? `${unresolvedReason}; ${failure}` : unresolvedReason)
            : inboundApplied(undefined, failure);
    }
}
