import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import {
    ErpDocumentWriter,
    ErpSalesDocument,
    ErpSalesDocumentLine,
} from '@mivend/plugin-erp-order';

import { CurrencyResolver } from '../currency-resolver.service';
import { documentEnvelope, documentOutcome } from './erp-document-payload';
import { inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { salesDocumentFields, salesDocumentLines } from './sales-document-payload';

// Stores one sales-chain document (#394) in the generic mirror; kind is the stream name, links are plain ERP ids.
@Injectable()
export class SalesDocumentStreamHandler {
    constructor(
        private readonly writer: ErpDocumentWriter,
        private readonly currencies: CurrencyResolver,
    ) {}

    forStream(kind: string): InboundStreamHandler {
        return {
            apply: (ctx, entityId, payload) => this.apply(kind, ctx, entityId, payload),
        };
    }

    private async apply(
        kind: string,
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const envelope = documentEnvelope(payload, 'number');
        if (!envelope) return inboundNoop(`${kind} ${entityId}: missing version`);
        const currency = envelope.hasBody
            ? await this.currencies.codeOf(ctx, `${kind} ${entityId}`, payload.currencyId)
            : null;
        const result = await this.writer.write(ctx, {
            target: ErpSalesDocument,
            erpId: entityId,
            ...envelope,
            fields: salesDocumentFields(kind, payload, currency),
            lines: [{ target: ErpSalesDocumentLine, rows: salesDocumentLines(payload) }],
        });
        return documentOutcome(kind, entityId, result);
    }
}
