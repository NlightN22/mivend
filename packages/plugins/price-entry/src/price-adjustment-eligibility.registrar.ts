import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { TransactionalConnection } from '@vendure/core';
import { ApprovalEligibilityRegistry } from '@mivend/plugin-approval-workflow';

import { DiscountLimitService } from './discount-limit.service';
import { LineDiscountService } from './line-discount.service';
import { mayApprovePrice } from './price-adjustment-eligibility';
import { PRICE_ADJUSTMENT_REQUEST_TYPE } from './price-adjustment.service';
import { getProductErpId } from './promo-product-lookup';

interface PriceRequestPayload {
    orderId: string;
    orderLineId: string;
    variantId: string;
    requestedPrice: number;
}

@Injectable()
export class PriceAdjustmentEligibilityRegistrar implements OnApplicationBootstrap {
    constructor(
        private registry: ApprovalEligibilityRegistry,
        private connection: TransactionalConnection,
        private limits: DiscountLimitService,
        private lineDiscounts: LineDiscountService,
    ) {}

    onApplicationBootstrap(): void {
        this.registry.register(PRICE_ADJUSTMENT_REQUEST_TYPE, async (ctx, request) => {
            const payload = JSON.parse(request.payload) as PriceRequestPayload;
            const reference =
                (await this.lineDiscounts.forOrderId(ctx, payload.orderId)).find(
                    d => d.lineId === payload.orderLineId,
                )?.reference ?? null;
            const productErpId = await getProductErpId(this.connection, ctx, payload.variantId);
            const ceilings = await this.limits.ceilingsForProducts(
                ctx,
                await this.limits.actorAdministratorId(ctx),
                [productErpId],
            );
            return mayApprovePrice({
                requestedPrice: payload.requestedPrice,
                reference,
                approverCeiling: ceilings.get(productErpId) ?? 0,
            });
        });
    }
}
