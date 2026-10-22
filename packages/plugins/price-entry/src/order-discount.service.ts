import { Injectable } from '@nestjs/common';
import { Order, OrderLine, RequestContext } from '@vendure/core';

import { LookupMemo } from './lookup-memo';
import { PriceResolutionService } from './price-resolution.service';

// Per unit, in the same tax terms as OrderLine.listPrice; absent lines get no discount.
export type OrderDiscountState = Map<string, number>;

interface CacheEntry {
    signature: string;
    state: Promise<OrderDiscountState>;
}

function hasManualPrice(line: OrderLine): boolean {
    return typeof line.customFields?.manualUnitPrice === 'number';
}

// One Vendure promotion test runs per line, so the whole-order state is computed once per order snapshot.
@Injectable()
export class OrderDiscountService {
    private cache = new WeakMap<Order, CacheEntry>();

    constructor(private priceResolution: PriceResolutionService) {}

    stateFor(ctx: RequestContext, order: Order): Promise<OrderDiscountState> {
        const lines = order.lines
            .map(l => `${String(l.id)}:${l.quantity}:${l.listPrice}:${hasManualPrice(l)}`)
            .join('|');
        // customer and contract pick the price type and the counterparty rules, so they belong to the snapshot.
        const signature = `${String(order.customerId)}:${String(order.customFields?.erpContractId)}|${lines}`;
        const cached = this.cache.get(order);
        if (cached?.signature === signature) return cached.state;
        const state = this.compute(ctx, order);
        this.cache.set(order, { signature, state });
        return state;
    }

    private async compute(ctx: RequestContext, order: Order): Promise<OrderDiscountState> {
        const state: OrderDiscountState = new Map();
        // Before any promotion of this pass: the persisted total still carries the previous discounts.
        const documentAmount = order.lines.reduce((sum, l) => sum + l.linePriceWithTax, 0);
        const memo = new LookupMemo();
        for (const line of order.lines) {
            if (hasManualPrice(line)) continue;
            const { customerPrice } = await this.priceResolution.resolve(
                ctx,
                String(line.productVariantId),
                { order, quantity: line.quantity, documentAmount },
                { memo },
            );
            if (customerPrice !== null && customerPrice < line.listPrice) {
                state.set(String(line.id), line.listPrice - customerPrice);
            }
        }
        return state;
    }
}
