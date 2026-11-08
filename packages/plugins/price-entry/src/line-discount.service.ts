import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    EntityRelationPaths,
    Order,
    OrderLine,
    OrderService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import { discountPercent } from './discount-percent';
import { LookupMemo } from './lookup-memo';
import { PriceResolutionService } from './price-resolution.service';
import { getProductErpId } from './promo-product-lookup';
import './types';

export interface LineDiscount {
    lineId: string;
    productErpId: string;
    // The customer's price before any manual price or order-dependent discount, in the line's tax terms.
    reference: number;
    // What one unit costs now (after every promotion), same tax terms as `reference`.
    effective: number;
    percent: number | null;
    manual: boolean;
}

export const LINE_DISCOUNT_RELATIONS: EntityRelationPaths<Order>[] = [
    'lines',
    'lines.productVariant',
];

export function isManualPrice(line: OrderLine): boolean {
    return typeof line.customFields?.manualUnitPrice === 'number';
}

export function effectiveUnitPrice(line: OrderLine): number {
    return line.listPriceIncludesTax ? line.proratedUnitPriceWithTax : line.proratedUnitPrice;
}

// The discount of a line is measured from its reference price, so it is the same number whether it comes
// from an automatic rule or a manual price.
@Injectable()
export class LineDiscountService {
    constructor(
        private connection: TransactionalConnection,
        private orderService: OrderService,
        private priceResolution: PriceResolutionService,
    ) {}

    async forOrderId(ctx: RequestContext, orderId: ID): Promise<LineDiscount[]> {
        const order = await this.orderService.findOne(ctx, orderId, LINE_DISCOUNT_RELATIONS);
        return order ? this.forOrder(ctx, order) : [];
    }

    async forOrder(ctx: RequestContext, order: Order): Promise<LineDiscount[]> {
        const memo = new LookupMemo();
        if (order.lines.some(isManualPrice)) await this.priceResolution.preload(ctx, order, memo);
        const result: LineDiscount[] = [];
        for (const line of order.lines) {
            const manual = isManualPrice(line);
            const reference = manual
                ? await this.manualReference(ctx, order, line, memo)
                : line.listPrice;
            const effective = effectiveUnitPrice(line);
            result.push({
                lineId: String(line.id),
                productErpId: await getProductErpId(
                    this.connection,
                    ctx,
                    String(line.productVariantId),
                    memo,
                ),
                reference,
                effective,
                percent: discountPercent(reference, effective),
                manual,
            });
        }
        return result;
    }

    private async manualReference(
        ctx: RequestContext,
        order: Order,
        line: OrderLine,
        memo: LookupMemo,
    ): Promise<number> {
        const { customerPrice } = await this.priceResolution.resolve(
            ctx,
            String(line.productVariantId),
            { order, quantity: line.quantity },
            { orderRules: false, memo },
        );
        return customerPrice ?? line.productVariant.listPrice;
    }

    // Lines whose discount a manual-discount limit judges: a purely automatic discount is not the employee's to limit,
    // and neither is a manual price that is not deeper than what the automatic rules give.
    async limitApplies(
        ctx: RequestContext,
        orderId: ID,
        discounts: LineDiscount[],
    ): Promise<Set<string>> {
        const applies = new Set<string>();
        const manual = discounts.filter(d => d.manual);
        const order = manual.length
            ? await this.orderService.findOne(ctx, orderId, LINE_DISCOUNT_RELATIONS)
            : undefined;
        for (const d of discounts) {
            if (!d.manual) {
                if (!((d.percent ?? 0) > 0)) applies.add(d.lineId);
                continue;
            }
            const line = order?.lines.find(l => String(l.id) === d.lineId);
            const automatic = order && line ? await this.automaticPrice(ctx, order, line) : null;
            if (automatic === null || d.effective < automatic) applies.add(d.lineId);
        }
        return applies;
    }

    // The unit price automatic rules would give the line right now, order-dependent rules included.
    async automaticPrice(
        ctx: RequestContext,
        order: Order,
        line: OrderLine,
    ): Promise<number | null> {
        const memo = new LookupMemo();
        await this.priceResolution.preload(ctx, order, memo);
        const documentAmount = order.lines.reduce((sum, l) => sum + l.linePriceWithTax, 0);
        const { customerPrice } = await this.priceResolution.resolve(
            ctx,
            String(line.productVariantId),
            { order, quantity: line.quantity, documentAmount },
            { memo },
        );
        return customerPrice;
    }
}
