import {
    Injector,
    Order,
    OrderItemPriceCalculationStrategy,
    PriceCalculationResult,
    ProductVariant,
    RequestContext,
} from '@vendure/core';
import { LookupMemo, PriceResolutionService } from '@mivend/plugin-price-entry';

interface RepriceState {
    memo: LookupMemo;
    preloaded: Set<string>;
}

export class CustomerPriceCalculationStrategy implements OrderItemPriceCalculationStrategy {
    private priceResolutionService!: PriceResolutionService;
    // Catalog data only, shared by every line a request reprices; never across requests.
    private states = new WeakMap<RequestContext, RepriceState>();

    init(injector: Injector): void {
        this.priceResolutionService = injector.get(PriceResolutionService);
    }

    async calculateUnitPrice(
        ctx: RequestContext,
        productVariant: ProductVariant,
        orderLineCustomFields: { [key: string]: unknown },
        order: Order,
        quantity: number,
    ): Promise<PriceCalculationResult> {
        // Only PriceAdjustmentService sets this, after floor-price approval; customer and ERP input never do.
        // Gated by the floor-price workflow; see docs/access-control.md layer 5.
        const manualUnitPrice = orderLineCustomFields.manualUnitPrice;
        if (typeof manualUnitPrice === 'number') {
            return {
                price: manualUnitPrice,
                priceIncludesTax: productVariant.listPriceIncludesTax,
            };
        }

        // Order-dependent rules arrive as a promotion adjustment (OrderDiscountService), not in the list price.
        const memo = await this.memoFor(ctx, order);
        const { customerPrice } = await this.priceResolutionService.resolve(
            ctx,
            String(productVariant.id),
            { order, quantity },
            { orderRules: false, memo },
        );
        return {
            price: customerPrice ?? productVariant.listPrice,
            priceIncludesTax: productVariant.listPriceIncludesTax,
        };
    }

    // Repricing every line of an order shares one memo and one preload instead of re-reading per line.
    private async memoFor(ctx: RequestContext, order: Order): Promise<LookupMemo> {
        let state = this.states.get(ctx);
        if (!state) {
            state = { memo: new LookupMemo(), preloaded: new Set() };
            this.states.set(ctx, state);
        }
        const key = `${String(order.id)}:${order.lines?.length ?? 0}`;
        if (order.id != null && order.lines?.length && !state.preloaded.has(key)) {
            state.preloaded.add(key);
            await this.priceResolutionService.preload(ctx, order, state.memo);
        }
        return state.memo;
    }
}
