import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { OrderCancelResultService } from '@mivend/plugin-reservation';

import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

// Applies order-cancel-result, the ERP's answer to cancel-requested.
// Field accounting: docs/ai/erp-streams-map.md, "order-cancel-result".
@Injectable()
export class OrderCancelResultHandler implements InboundStreamHandler {
    constructor(private readonly cancelResults: OrderCancelResultService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        if (payload.isDeleted === true) {
            return inboundNoop(`order-cancel-result ${entityId}: deleted, skipping`);
        }
        // order_uuid is a plain proto3 string: '' means absent, nothing to correlate by.
        const orderUuid = payload.orderUuid != null ? String(payload.orderUuid) : '';
        if (orderUuid === '') {
            return inboundNoop(`order-cancel-result ${entityId}: no orderUuid to correlate by`);
        }
        const status = payload.status != null ? String(payload.status) : '';
        if (status !== 'cancelled' && status !== 'rejected') {
            return inboundNoop(`order-cancel-result ${entityId}: unknown status "${status}"`);
        }
        const reason = payload.businessRejectionReason as
            | Record<string, unknown>
            | null
            | undefined;

        const outcome = await this.cancelResults.apply(ctx, {
            orderUuid,
            status,
            rejectionReasonCode: reason != null ? String(reason.code ?? '') : null,
            rejectionReasonText: reason != null ? String(reason.message ?? '') : null,
        });
        switch (outcome) {
            case 'cancelled':
            case 'refusal-recorded':
            case 'refusal-after-local-cancel':
                return inboundApplied();
            case 'already-cancelled':
                return inboundNoop(`order-cancel-result ${entityId}: order already cancelled`);
            case 'refusal-repeated':
                return inboundNoop(`order-cancel-result ${entityId}: refusal already recorded`);
            case 'refusal-without-request':
                return inboundNoop(`order-cancel-result ${entityId}: refusal without a request`);
        }
    }
}
