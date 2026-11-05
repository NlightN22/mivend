import type { Injector, OrderProcess, OrderState, OrderTransitionData } from '@vendure/core';
import { TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { HiddenCategoryProductsService } from './hidden-category-products.service';

export const HIDDEN_CATEGORY_LINES_MESSAGE =
    'The cart contains products that are no longer available; remove them to continue.';

// A customer cannot place an order that holds a line whose category was hidden after it was added.
export class HiddenCategoryOrderProcess implements OrderProcess<OrderState> {
    private connection!: TransactionalConnection;
    private hidden!: HiddenCategoryProductsService;

    init(injector: Injector): void {
        this.connection = injector.get(TransactionalConnection);
        this.hidden = injector.get(HiddenCategoryProductsService);
    }

    async onTransitionStart(
        fromState: OrderState,
        toState: OrderState,
        { ctx, order }: OrderTransitionData,
    ): Promise<string | undefined> {
        const placement = fromState === 'AddingItems' && toState === 'ArrangingPayment';
        const payment =
            fromState === 'ArrangingPayment' &&
            (toState === 'PaymentAuthorized' || toState === 'PaymentSettled');
        if (ctx.apiType !== 'shop' || (!placement && !payment)) return undefined;
        const rows = await ctxQuery<Array<{ productId: number }>>(
            this.connection,
            ctx,
            `SELECT DISTINCT pv."productId" FROM order_line ol
             JOIN product_variant pv ON pv.id = ol."productVariantId"
             WHERE ol."orderId" = $1`,
            [order.id],
        );
        const blocked = await this.hidden.hiddenProductIds(
            ctx,
            rows.map(row => row.productId),
        );
        return blocked.size > 0 ? HIDDEN_CATEGORY_LINES_MESSAGE : undefined;
    }
}
