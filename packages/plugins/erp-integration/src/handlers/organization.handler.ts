import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { OrganizationEventService } from '@mivend/plugin-documents';
import type { RequisiteFields } from '@mivend/plugin-documents';

import { OrganizationBankRequisitesService } from '../organization-bank-requisites.service';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationOrganizationHandler';

const OWN_REQUISITES = ['inn', 'kpp', 'ogrn'] as const;

// Applies the `organization` stream: name, active state, own legal requisites and the main bank account id.
// Address, phone and channels come from the contact-info stream, bank requisites from the bank chain.
@Injectable()
export class OrganizationStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly organizationEvents: OrganizationEventService,
        private readonly bankRequisites: OrganizationBankRequisitesService,
    ) {}

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
        for (const field of OWN_REQUISITES) fields[field] = text(payload[field]);

        const stored = await this.organizationEvents.upsertFromEvent(ctx, entityId, {
            legalName,
            isActive,
            controlsStock:
                typeof payload.controlsStock === 'boolean' ? payload.controlsStock : undefined,
            fields,
            mainBankAccountId:
                'mainBankAccountId' in payload ? text(payload.mainBankAccountId) : undefined,
        });
        if (!stored) {
            return inboundNoop(`organization ${entityId}: nameless tombstone for an unknown row`);
        }
        await this.bankRequisites.refresh(ctx, { organizationErpId: entityId });
        Logger.verbose(`Upserted organization erpId=${entityId}`, loggerCtx);
        return inboundApplied();
    }
}

function text(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}
