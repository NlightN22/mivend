import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { SettlementDocumentTypeService } from '@mivend/plugin-settlement';

import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

// Applies `settlement-document-type` (#227): the ERP-owned reference that groups documentType
// values and decides customer visibility. A missing record or flag keeps a type hidden.
@Injectable()
export class SettlementDocumentTypeStreamHandler implements InboundStreamHandler {
    constructor(private readonly typeService: SettlementDocumentTypeService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const version = String(payload.version ?? '');
        if (!entityId || !version) {
            return inboundNoop(`settlement-document-type ${entityId}: missing key/version`);
        }
        // Plain proto3 bool: a false value is omitted, so absent means not visible.
        const result = await this.typeService.apply(ctx, {
            documentType: entityId,
            version,
            isDeleted: payload.isDeleted === true,
            label: String(payload.documentTypeLabel ?? entityId),
            category: String(payload.category ?? 'other'),
            customerVisible: payload.customerVisible === true,
            sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : null,
        });
        if (result === 'stale') {
            return inboundNoop(`settlement-document-type ${entityId}: version not newer`);
        }
        if (result === 'unknown-deleted') {
            return inboundNoop(`settlement-document-type ${entityId}: deletion of an unknown type`);
        }
        return inboundApplied();
    }
}
