import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { DocumentsService } from '@mivend/plugin-documents';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationOrganizationHandler';

// Applies Integration Service's `organization` stream (OrganizationChanged). This stream only
// carries name/isActive/isDeleted — never legalName/inn/legalAddress/bank details, which stay
// erp-import's own job (plugin-documents' OrganizationRequisitesRecord, a richer REST record —
// see docs/payments.md "Organizations"). So this handler only ever UPDATES an existing
// OrganizationRequisites row found by erpId, never creates one: fabricating the required
// legalName/inn/legalAddress columns from data this stream doesn't have would put fake legal/bank
// data in front of real invoice/PDF rendering (documents.service.ts's getRequisitesById).
@Injectable()
export class OrganizationStreamHandler implements InboundStreamHandler {
    constructor(private readonly documentsService: DocumentsService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const name = String(payload.name ?? '');
        if (!name) {
            Logger.warn(`organization ${entityId}: missing name, skipping`, loggerCtx);
            return;
        }
        const isActive = payload.isActive !== false;

        const updated = await this.documentsService.updateActiveStateIfExists(
            ctx,
            entityId,
            name,
            isActive,
        );
        if (!updated) {
            Logger.verbose(
                `organization ${entityId}: no OrganizationRequisites found yet (awaiting erp-import's ` +
                    `full legal requisites) — skipping`,
                loggerCtx,
            );
            return;
        }
        Logger.verbose(`Updated organization erpId=${entityId}`, loggerCtx);
    }
}
