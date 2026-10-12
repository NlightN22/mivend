import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { OrganizationEventService, REQUISITE_FIELDS } from '@mivend/plugin-documents';
import type { RequisiteFields } from '@mivend/plugin-documents';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationOrganizationHandler';

// Applies the `organization` stream: name, active state and the legal/bank requisites. An empty
// requisite means "not provided" and never wipes a stored value (docs/payments.md "Organizations").
@Injectable()
export class OrganizationStreamHandler implements InboundStreamHandler {
    constructor(private readonly organizationEvents: OrganizationEventService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        // A deletion tombstone carries no name: it may deactivate a known row, never create one.
        const legalName = text(payload.legalName) ?? text(payload.name);
        // proto3 omits the false zero-value, so an absent isActive means false.
        const isActive = payload.isActive === true && payload.isDeleted !== true;
        const fields: RequisiteFields = {};
        for (const field of REQUISITE_FIELDS) fields[field] = text(payload[field]);

        const stored = await this.organizationEvents.upsertFromEvent(ctx, entityId, {
            legalName,
            isActive,
            fields,
        });
        if (!stored) {
            return inboundNoop(`organization ${entityId}: nameless tombstone for an unknown row`);
        }
        Logger.verbose(`Upserted organization erpId=${entityId}`, loggerCtx);
        return inboundApplied();
    }
}

function text(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}
