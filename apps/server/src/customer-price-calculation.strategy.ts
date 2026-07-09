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
        // A manager-adjusted price (PriceAdjustmentService, gated by the floor-price approval
        // workflow — see docs/access-control.md layer 5) takes precedence over the normal
        // resolution path. Set only by that service, never by the customer or ERP import.
        const manualUnitPrice = orderLineCustomFields.manualUnitPrice;
        if (typeof manualUnitPrice === 'number') {
            return {
                price: manualUnitPrice,
                priceIncludesTax: productVariant.listPriceIncludesTax,
            };
        }

        const { customerPrice } = await this.priceResolutionService.resolve(
            ctx,
            String(productVariant.id),
            { order, quantity },
        );
        return {
            price: customerPrice ?? productVariant.listPrice,
            priceIncludesTax: productVariant.listPriceIncludesTax,
        };
    }
}
