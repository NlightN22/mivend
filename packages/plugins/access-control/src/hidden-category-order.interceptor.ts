import {
    Injector,
    Order,
    OrderInterceptor,
    RequestContext,
    WillAddItemToOrderInput,
} from '@vendure/core';

import { HiddenCategoryProductsService } from './hidden-category-products.service';

// Customers cannot add a product they cannot see; staff (admin API) keep adding any product to draft orders.
export class HiddenCategoryOrderInterceptor implements OrderInterceptor {
    private hidden!: HiddenCategoryProductsService;

    init(injector: Injector): void {
        this.hidden = injector.get(HiddenCategoryProductsService);
    }

    async willAddItemToOrder(
        ctx: RequestContext,
        _order: Order,
        input: WillAddItemToOrderInput,
    ): Promise<void | string> {
        if (ctx.apiType !== 'shop') return;
        const hidden = await this.hidden.hiddenProductIds(ctx, [input.productVariant.productId]);
        if (hidden.size > 0) return 'error.product-not-available';
    }
}
