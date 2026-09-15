import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { DocumentsService } from '@mivend/plugin-documents';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationOrganizationHandler';

// Applies Integration Service's `organization` stream (OrganizationChanged). This stream only
// carries name/isActive/isDeleted — never inn/legalAddress/bank details, which stay erp-import's
// own job (plugin-documents' OrganizationRequisitesRecord, a richer REST record — see
// docs/payments.md "Organizations"). Issue #88: previously update-only (skipped entirely when no
// existing OrganizationRequisites row matched erpId), which meant an organization mivend only
// knows about via Kafka (e.g. the staging-integration contour, which never runs erp-import at
// all — issue #68) was invisible forever with no local row and no way to reconcile against it
// (issue #84's ErpReconciliationIssue for `organization` always showed a full 0-vs-N gap). Now
// always creates/updates a row via legalName=name; inn/legalAddress/bank fields stay null until
// erp-import's own record arrives, if it ever does in this contour — never fabricated here.
// PdfGeneratorService refuses to render an invoice/contract against a still-partial row.
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
        // Absent isActive means false, not true — see types.ts's InboundStream comment (proto3 bool
        // zero-value omission). isDeleted folds in the same way every sibling handler does
        // (warehouse/price/stock/category) — Integration Service can send isActive:true and
        // isDeleted:true on the same event, and this handler previously ignored isDeleted
        // entirely despite its own doc comment claiming to read it, leaving a deleted
        // organization permanently isActive:true locally and overcounted by
        // ReconciliationLocalCountsService.countActiveOrganizations (same class of bug #90 fixed
        // for categories via isPrivate).
        const isActive = payload.isActive === true && payload.isDeleted !== true;

        await this.documentsService.upsertActiveState(ctx, entityId, name, isActive);
        Logger.verbose(`Upserted organization erpId=${entityId}`, loggerCtx);
    }
}
