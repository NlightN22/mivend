import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import {
    ErpDocumentWriter,
    OrderCorrectionContainerLineErp,
    OrderCorrectionErp,
    OrderCorrectionGoodsLineErp,
    OrderCorrectionServiceLineErp,
} from '@mivend/plugin-erp-order';

import { documentEnvelope, documentOutcome } from './erp-document-payload';
import { inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import {
    orderCorrectionContainerLines,
    orderCorrectionFields,
    orderCorrectionGoodsLines,
    orderCorrectionServiceLines,
} from './order-correction-payload';

// Stores `order-correction` (#254) as received in order_correction_erp and its line tables; links are plain ERP ids.
@Injectable()
export class OrderCorrectionStreamHandler implements InboundStreamHandler {
    constructor(private readonly writer: ErpDocumentWriter) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const envelope = documentEnvelope(payload, 'number');
        if (!envelope) return inboundNoop(`order-correction ${entityId}: missing version`);
        const result = await this.writer.write(ctx, {
            target: OrderCorrectionErp,
            erpId: entityId,
            ...envelope,
            fields: orderCorrectionFields(payload),
            lines: [
                { target: OrderCorrectionGoodsLineErp, rows: orderCorrectionGoodsLines(payload) },
                {
                    target: OrderCorrectionServiceLineErp,
                    rows: orderCorrectionServiceLines(payload),
                },
                {
                    target: OrderCorrectionContainerLineErp,
                    rows: orderCorrectionContainerLines(payload),
                },
            ],
        });
        return documentOutcome('order-correction', entityId, result);
    }
}
