import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { ErpDocumentWriter, OrderChangeResultErp } from '@mivend/plugin-erp-order';

import { documentEnvelope, documentOutcome, ref, str } from './erp-document-payload';
import { inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

// Stores `order-change-result` (#254) as history in order_change_result_erp; mivend sends no change commands, so nothing acts on it.
@Injectable()
export class OrderChangeResultStreamHandler implements InboundStreamHandler {
    constructor(private readonly writer: ErpDocumentWriter) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const envelope = documentEnvelope(payload, 'status');
        if (!envelope) return inboundNoop(`order-change-result ${entityId}: missing version`);
        const reason = ref(payload.businessRejectionReason);
        const result = await this.writer.write(ctx, {
            target: OrderChangeResultErp,
            erpId: entityId,
            ...envelope,
            fields: {
                requestId: str(payload.requestEntityId),
                orderId: str(payload.orderEntityId),
                status: str(payload.status) ?? '',
                rejectionCode: str(reason?.code),
                rejectionMessage: str(reason?.message),
            },
            lines: [],
        });
        return documentOutcome('order-change-result', entityId, result);
    }
}
