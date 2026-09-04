import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationPriceHandler';

// Applies Integration Service's `price` stream (PriceChanged: productId/priceTypeId/value, not
// sku/priceTypeCode/price — issue #63).
//
// 1C's priceTypeId has no known mapping to MiVend's own PriceType.code yet — PriceType
// (packages/plugins/customer-pricing) has no externalId column, only a business `code`, and
// nothing in this codebase maps one to the other (see issue #63/#62's deferred price-type
// mapping design gap). Guessing that priceTypeId happens to equal `code` would silently corrupt
// pricing data (AGENTS.md rule #13/payments-style "never pick a number that looks right"), so
// every price event is a deliberate, permanent log-and-skip until that mapping is designed — not
// a bug, and not something this handler should guess its way around.
@Injectable()
export class PriceStreamHandler implements InboundStreamHandler {
    async apply(
        _ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const priceTypeId = String(payload.priceTypeId ?? '');
        Logger.warn(
            `price ${entityId}: no priceTypeId->PriceType.code mapping designed yet ` +
                `(priceTypeId=${priceTypeId}), skipping`,
            loggerCtx,
        );
    }
}
