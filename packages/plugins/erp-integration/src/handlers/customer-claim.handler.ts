import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import {
    CustomerClaimErp,
    CustomerClaimGoodsLineErp,
    CustomerClaimServiceLineErp,
    ErpDocumentWriter,
} from '@mivend/plugin-erp-order';

import {
    customerClaimFields,
    customerClaimGoodsLines,
    customerClaimServiceLines,
} from './customer-claim-payload';
import { documentEnvelope, documentOutcome } from './erp-document-payload';
import { inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

// Stores `customer-claim` (#254) as received in customer_claim_erp and its line tables; links are plain ERP ids.
@Injectable()
export class CustomerClaimStreamHandler implements InboundStreamHandler {
    constructor(private readonly writer: ErpDocumentWriter) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const envelope = documentEnvelope(payload, 'number');
        if (!envelope) return inboundNoop(`customer-claim ${entityId}: missing version`);
        const result = await this.writer.write(ctx, {
            target: CustomerClaimErp,
            erpId: entityId,
            ...envelope,
            fields: customerClaimFields(payload),
            lines: [
                { target: CustomerClaimGoodsLineErp, rows: customerClaimGoodsLines(payload) },
                { target: CustomerClaimServiceLineErp, rows: customerClaimServiceLines(payload) },
            ],
        });
        return documentOutcome('customer-claim', entityId, result);
    }
}
