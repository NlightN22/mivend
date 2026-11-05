import type { Injector, OrderProcess, OrderState } from '@vendure/core';
import { TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { HiddenCategoryProductsService } from './hidden-category-products.service';

export const HIDDEN_CATEGORY_LINES_MESSAGE =
    'The cart contains products that are no longer available; remove them to continue.';

let connection: TransactionalConnection;
let hidden: HiddenCategoryProductsService;

// A customer cannot place an order that holds a line whose category was hidden after it was added.
export const hiddenCategoryOrderProcess: OrderProcess<OrderState> = {
    init(injector: Injector) {
        connection = injector.get(TransactionalConnection);
        hidden = injector.get(HiddenCategoryProductsService);
    },
    async onTransitionStart(fromState, toState, { ctx, order }) {
        const placement = fromState === 'AddingItems' && toState === 'ArrangingPayment';
        const payment =
            fromState === 'ArrangingPayment' &&
            (toState === 'PaymentAuthorized' || toState === 'PaymentSettled');
        if (ctx.apiType !== 'shop' || (!placement && !payment)) return;
        const rows = await ctxQuery<Array<{ productId: number }>>(
            connection,
            ctx,
            `SELECT DISTINCT pv."productId" FROM order_line ol
             JOIN product_variant pv ON pv.id = ol."productVariantId"
             WHERE ol."orderId" = $1`,
            [order.id],
        );
        const blocked = await hidden.hiddenProductIds(
            ctx,
            rows.map(row => row.productId),
        );
        if (blocked.size > 0) return HIDDEN_CATEGORY_LINES_MESSAGE;
    },
};
