import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { CustomerPricingService } from '@mivend/plugin-customer-pricing';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationPriceTypeHandler';

// entityId is the ERP's own GUID; it must match PriceChanged.priceTypeId (see PriceStreamHandler).
// Maps name/isActive and the purchase-type rule (isPurchasePriceType, ceilingPriceMultiplier); currency is skipped.
@Injectable()
export class PriceTypeStreamHandler implements InboundStreamHandler {
    constructor(private readonly customerPricingService: CustomerPricingService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const name = String(payload.name ?? '');
        if (!name) {
            return inboundNoop(`price-type ${entityId}: missing name, skipping`);
        }
        // Absent isActive means false, not true — see types.ts's InboundStream comment (proto3 bool
        // zero-value omission).
        const isActive = payload.isActive === true;
        const isPurchase = payload.isPurchasePriceType === true;
        const multiplier = Number(payload.ceilingPriceMultiplier);
        await this.customerPricingService.upsertPriceTypeByExternalId(
            ctx,
            entityId,
            name,
            isActive,
            {
                isPurchase,
                ceilingMultiplier:
                    Number.isFinite(multiplier) && multiplier > 0 ? multiplier : null,
            },
        );
        Logger.verbose(`Upserted price type externalId=${entityId}`, loggerCtx);
        return inboundApplied();
    }
}
