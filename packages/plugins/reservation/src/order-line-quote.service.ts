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

import { MAX_LINE_QUANTITY } from './order-line-sku';
import { LINE_PRICE_CHECK, type LinePriceCheck } from './line-price-check';
import { findVariantBySku, noPriceMessage } from './order-line-sku';
import { ReservationAvailabilityService } from './reservation-availability.service';

export interface OrderLineQuote {
    variantId: string;
    sku: string;
    name: string;
    customerPrice: number;
    referencePrice: number;
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

    async quote(
        ctx: RequestContext,
        orderId: ID,
        sku: string,
        quantity = 1,
    ): Promise<OrderLineQuote> {
        if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_LINE_QUANTITY) {
            throw new UserInputError(
                `Quantity must be a whole number from 1 to ${MAX_LINE_QUANTITY}`,
            );
        }
        if (!(await this.orderVisibility.visibleIds(ctx, [orderId])).has(String(orderId))) {
            throw new EntityNotFoundError('Order', orderId);
        }
        const order = await this.orderService.findOne(ctx, orderId, ['lines']);
        if (!order) throw new EntityNotFoundError('Order', orderId);
        const variant = await findVariantBySku(this.connection, ctx, sku);
        // Adding merges into an existing line of the article, so the tier is that of existing + quantity.
        const existing = order.lines
            .filter(l => String(l.productVariantId) === String(variant.id))
            .reduce((sum, l) => sum + l.quantity, 0);
        const priced = await this.moduleRef
            .get<LinePriceCheck>(LINE_PRICE_CHECK, { strict: false })
            .quote(ctx, order, variant.id, existing + quantity);
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
