import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { ID } from '@vendure/common/lib/shared-types';
import {
    EntityNotFoundError,
    OrderService,
    ProductVariantService,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';

import { LINE_PRICE_CHECK, type LinePriceCheck } from './line-price-check';
import { findVariantBySku, noPriceMessage } from './order-line-sku';
import { ReservationAvailabilityService } from './reservation-availability.service';

export interface OrderLineQuote {
    variantId: string;
    sku: string;
    name: string;
    customerPrice: number;
    referencePrice: number;
    discountPercent: number | null;
    available: number;
}

// What adding an article to this order would cost the customer and what the branch warehouses can cover now (#320).
@Injectable()
export class OrderLineQuoteService {
    constructor(
        private connection: TransactionalConnection,
        private orderService: OrderService,
        private variants: ProductVariantService,
        private orderVisibility: OrderVisibilityService,
        private availability: ReservationAvailabilityService,
        private moduleRef: ModuleRef,
    ) {}

    async quote(ctx: RequestContext, orderId: ID, sku: string): Promise<OrderLineQuote> {
        if (!(await this.orderVisibility.visibleIds(ctx, [orderId])).has(String(orderId))) {
            throw new EntityNotFoundError('Order', orderId);
        }
        const order = await this.orderService.findOne(ctx, orderId);
        if (!order) throw new EntityNotFoundError('Order', orderId);
        const variant = await findVariantBySku(this.connection, ctx, sku);
        const priced = await this.moduleRef
            .get<LinePriceCheck>(LINE_PRICE_CHECK, { strict: false })
            .quote(ctx, order, variant.id);
        if (!priced) throw new UserInputError(noPriceMessage(sku));
        const branchId = order.customFields?.branchId;
        const locations = branchId
            ? await this.availability.findBranchStockLocationIds(ctx, branchId)
            : [];
        const free = await this.availability.getFreeByLocation(
            ctx,
            [String(variant.id)],
            locations,
        );
        return {
            variantId: String(variant.id),
            sku: variant.sku,
            name: (await this.variants.findOne(ctx, variant.id))?.name ?? variant.sku,
            ...priced,
            available: Math.max(0, ...(free.get(String(variant.id))?.values() ?? [])),
        };
    }
}
