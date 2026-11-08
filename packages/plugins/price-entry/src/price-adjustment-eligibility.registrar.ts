import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { TransactionalConnection } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { ApprovalEligibilityRegistry } from '@mivend/plugin-approval-workflow';

import { DiscountLimitService } from './discount-limit.service';
import { FloorPriceService } from './floor-price.service';
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
        private floors: FloorPriceService,
    ) {}

    onApplicationBootstrap(): void {
        this.registry.register(PRICE_ADJUSTMENT_REQUEST_TYPE, async (ctx, request) => {
            const payload = JSON.parse(request.payload) as PriceRequestPayload;
            const reference =
                (await this.lineDiscounts.forOrderId(ctx, payload.orderId)).find(
                    d => d.lineId === payload.orderLineId,
                )?.reference ?? null;
            const floor = (await this.floors.forVariants(ctx, [payload.variantId])).get(
                payload.variantId,
            );
            const productErpId = await getProductErpId(this.connection, ctx, payload.variantId);
            const ceilings = await this.limits.ceilingsForProducts(
                ctx,
                await this.limits.actorAdministratorId(ctx),
                [productErpId],
            );
            return mayApprovePrice({
                requestedPrice: payload.requestedPrice,
                reference,
                floor: floor ?? null,
                approverCeiling: ceilings.get(productErpId) ?? null,
                canApproveBelowFloor: ctx.userHasPermissions([
                    CustomPermission.ApproveBelowFloorPrice.Permission,
                ]),
            });
        });
    }
}
