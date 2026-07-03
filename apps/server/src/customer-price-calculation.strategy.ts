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
        _orderLineCustomFields: { [key: string]: unknown },
        order: Order,
        quantity: number,
    ): Promise<PriceCalculationResult> {
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
