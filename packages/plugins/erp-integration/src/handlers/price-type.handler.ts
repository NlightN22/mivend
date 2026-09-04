import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { CustomerPricingService } from '@mivend/plugin-customer-pricing';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationPriceTypeHandler';

// Applies Integration Service's `price-type` stream (PriceTypeChanged). entityId is 1C's own
// GUID for the price type, verified against Integration Service's real 1C export code to be the
// same value PriceChanged.priceTypeId refers back to — see PriceStreamHandler. Only name/isActive
// are used here; currency/isPurchasePriceType/ceilingPriceMultiplier are a separate, out-of-scope
// feature (issue #63).
@Injectable()
export class PriceTypeStreamHandler implements InboundStreamHandler {
    constructor(private readonly customerPricingService: CustomerPricingService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const name = String(payload.name ?? '');
        if (!name) {
            Logger.warn(`price-type ${entityId}: missing name, skipping`, loggerCtx);
            return;
        }
        const isActive = payload.isActive !== false;
        await this.customerPricingService.upsertPriceTypeByExternalId(
            ctx,
            entityId,
            name,
            isActive,
        );
        Logger.verbose(`Upserted price type externalId=${entityId}`, loggerCtx);
    }
}
