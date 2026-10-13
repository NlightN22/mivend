import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { OrganizationEventService, REQUISITE_FIELDS } from '@mivend/plugin-documents';
import type { OrganizationSignatory, RequisiteFields } from '@mivend/plugin-documents';
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
        // is_active is `optional` (presence-tracked): absent means "not provided", it keeps the stored value.
        const isActive =
            payload.isDeleted === true
                ? false
                : typeof payload.isActive === 'boolean'
                  ? payload.isActive
                  : undefined;
        const fields: RequisiteFields = {};
        for (const field of REQUISITE_FIELDS) fields[field] = text(payload[field]);

        const stored = await this.organizationEvents.upsertFromEvent(ctx, entityId, {
            legalName,
            isActive,
            fields,
            signatories: toSignatories(payload.signatories),
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

function toSignatories(value: unknown): OrganizationSignatory[] {
    if (!Array.isArray(value)) return [];
    const result: OrganizationSignatory[] = [];
    for (const item of value as Record<string, unknown>[]) {
        const role = text(item?.role);
        const personName = text(item?.personName);
        if (!role || !personName) continue;
        result.push({
            role,
            roleLabel: text(item.roleLabel) ?? role,
            personName,
            position: text(item.position),
        });
    }
    return result;
}
