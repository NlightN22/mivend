import {
    Injector,
    Order,
    OrderItemPriceCalculationStrategy,
    PriceCalculationResult,
    ProductVariant,
    RequestContext,
} from '@vendure/core';
import { PriceResolutionService } from '@mivend/plugin-price-entry';

export class CustomerPriceCalculationStrategy implements OrderItemPriceCalculationStrategy {
    private priceResolutionService!: PriceResolutionService;

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
        const { customerPrice } = await this.priceResolutionService.resolve(
            ctx,
            String(productVariant.id),
            { order, quantity },
            { orderRules: false },
        );
        return {
            price: customerPrice ?? productVariant.listPrice,
            priceIncludesTax: productVariant.listPriceIncludesTax,
        };
    }
}
