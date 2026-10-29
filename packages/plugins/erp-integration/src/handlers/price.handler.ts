import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { CustomerPricingService } from '@mivend/plugin-customer-pricing';
import { PriceEntryService } from '@mivend/plugin-price-entry';

import { MissingDependencyError } from '../types';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationPriceHandler';

// priceTypeId is the ERP's GUID, not a local id: resolve it via PriceType.externalId.
// Mapping lives in PriceTypeStreamHandler.
@Injectable()
export class PriceStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly customerPricingService: CustomerPricingService,
        private readonly priceEntryService: PriceEntryService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const removal = payload.isActive !== true || payload.isDeleted === true;
        // A tombstone carries identity only in entityId ("productId:priceTypeId"); its body fields are empty.
        const [keyProductId = '', keyPriceTypeId = ''] = entityId.split(':');
        const productId = String(payload.productId || (removal ? keyProductId : ''));
        const priceTypeId = String(payload.priceTypeId || (removal ? keyPriceTypeId : ''));
        const value = Number.parseFloat(String(payload.value ?? ''));

        // Absent isActive means false (proto3 zero-value omission, see types.ts), so it removes too.
        if (!productId || !priceTypeId || (!removal && Number.isNaN(value))) {
            return inboundNoop(`price ${entityId}: missing productId/priceTypeId/value, skipping`);
        }

        // Out-of-order stream delivery: the price-type event for this GUID may not have been
        // processed yet. Not a bug — skip and let a later retry/version pick it up.
        const priceType = await this.customerPricingService.findPriceTypeByExternalId(
            ctx,
            priceTypeId,
        );
        if (!priceType) {
            if (removal) return inboundNoop(`price ${entityId}: tombstone for unknown price type`);
            // Issue #96: ordinary eventual-consistency race (price-type stream not consumed yet),
            // not a malformed payload — retry via MissingDependencyError instead of dropping.
            throw new MissingDependencyError(
                `price ${entityId}: no PriceType found for priceTypeId=${priceTypeId}`,
            );
        }

        if (removal) {
            const removed = await this.priceEntryService.removeByProduct(
                ctx,
                productId,
                priceType.code,
            );
            return removed
                ? inboundApplied()
                : inboundNoop(`price ${entityId}: tombstone, no stored price`);
        }

        const priceInCents = Math.round(value * 100);
        await this.priceEntryService.upsertByProduct(ctx, productId, priceType.code, priceInCents);
        Logger.verbose(
            `Upserted price productId=${productId} priceType=${priceType.code} value=${value}`,
            loggerCtx,
        );
        return inboundApplied();
    }
}
