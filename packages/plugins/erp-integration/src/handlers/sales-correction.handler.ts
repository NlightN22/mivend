import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import {
    ErpDocumentWriter,
    SalesCorrectionErp,
    SalesCorrectionGoodsLineErp,
    SalesCorrectionServiceLineErp,
} from '@mivend/plugin-erp-order';

import { CurrencyResolver } from '../currency-resolver.service';
import { documentEnvelope, documentOutcome } from './erp-document-payload';
import { inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import {
    salesCorrectionFields,
    salesCorrectionGoodsLines,
    salesCorrectionServiceLines,
} from './sales-correction-payload';

// Stores `sales-correction` (#254) as received in sales_correction_erp and its line tables; links are plain ERP ids.
@Injectable()
export class SalesCorrectionStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly writer: ErpDocumentWriter,
        private readonly currencies: CurrencyResolver,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const envelope = documentEnvelope(payload, 'number');
        if (!envelope) return inboundNoop(`sales-correction ${entityId}: missing version`);
        const result = await this.writer.write(ctx, {
            target: SalesCorrectionErp,
            erpId: entityId,
            ...envelope,
            fields: salesCorrectionFields(
                payload,
                await this.currencies.codeOf(
                    ctx,
                    `sales-correction ${entityId}`,
                    payload.currencyId,
                ),
            ),
            lines: [
                { target: SalesCorrectionGoodsLineErp, rows: salesCorrectionGoodsLines(payload) },
                {
                    target: SalesCorrectionServiceLineErp,
                    rows: salesCorrectionServiceLines(payload),
                },
            ],
        });
        return documentOutcome('sales-correction', entityId, result);
    }
}
