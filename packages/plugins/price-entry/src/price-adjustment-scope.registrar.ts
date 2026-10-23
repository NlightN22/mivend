import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ApprovalScopeRegistry, payloadField } from '@mivend/plugin-approval-workflow';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';

import { PRICE_ADJUSTMENT_REQUEST_TYPE } from './price-adjustment.service';
import { DISCOUNT_GRANT_REQUEST_TYPE } from './discount-grant.types';

// A price-adjustment request belongs to its order: visible and decidable within that order's scope.
@Injectable()
export class PriceAdjustmentScopeRegistrar implements OnApplicationBootstrap {
    constructor(
        private readonly registry: ApprovalScopeRegistry,
        private readonly orders: OrderVisibilityService,
    ) {}

    onApplicationBootstrap(): void {
        // Discount grants are company-wide policy, gated by price type only.
        this.registry.register(DISCOUNT_GRANT_REQUEST_TYPE, null);
        this.registry.register(PRICE_ADJUSTMENT_REQUEST_TYPE, async ctx => {
            const visible = await this.orders.visibleIdsSql(ctx);
            return (
                visible && {
                    sql: `${payloadField('orderId')} IN (${visible.sql})`,
                    params: visible.params,
                }
            );
        });
    }
}
