import type { Injector, OrderProcess, OrderState } from '@vendure/core';
import { OrderLine, TransactionalConnection } from '@vendure/core';

let connection: TransactionalConnection;

// Stamps only: a variant without an organization is the `order.line-without-organization` finding, never a refusal.
// Re-stamped on each ArrangingPayment entry so later steps never re-read the variant.
export const organizationOrderGuard: OrderProcess<OrderState> = {
    init(injector: Injector) {
        connection = injector.get(TransactionalConnection);
    },
    async onTransitionEnd(_fromState, toState, { ctx, order }) {
        if (toState !== 'ArrangingPayment') return;
        // Order row lock first: a concurrent mutation holding stale lines must commit before this stamp.
        await connection
            .getRepository(ctx, OrderLine)
            .query('SELECT id FROM "order" WHERE id = $1 FOR UPDATE', [order.id]);
        await connection.getRepository(ctx, OrderLine).query(
            `UPDATE order_line l SET "customFieldsOrganizationid" = v."customFieldsOrganizationid"
             FROM product_variant v
             WHERE v.id = l."productVariantId" AND l."orderId" = $1
               AND v."customFieldsOrganizationid" IS NOT NULL`,
            [order.id],
        );
    },
};
