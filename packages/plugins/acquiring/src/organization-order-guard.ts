import type { Injector, OrderProcess, OrderState } from '@vendure/core';
import { OrderLine, TransactionalConnection } from '@vendure/core';

export const ORGANIZATION_MISSING_MESSAGE =
    'Some items cannot be ordered right now. Remove them from the cart to continue: ';

let connection: TransactionalConnection;

// Blocks checkout for everyone and every payment method: addPaymentToOrder needs ArrangingPayment.
export const organizationOrderGuard: OrderProcess<OrderState> = {
    init(injector: Injector) {
        connection = injector.get(TransactionalConnection);
    },
    async onTransitionStart(_fromState, toState, { order }) {
        if (toState !== 'ArrangingPayment') return;
        const rows: Array<{ sku: string }> = await connection.rawConnection.query(
            `SELECT v.sku FROM order_line l
             INNER JOIN product_variant v ON v.id = l."productVariantId"
             WHERE l."orderId" = $1 AND v."customFieldsOrganizationid" IS NULL
             ORDER BY l.id`,
            [order.id],
        );
        if (rows.length === 0) return;
        return ORGANIZATION_MISSING_MESSAGE + rows.map(row => row.sku).join(', ');
    },
    // Re-stamped on every entry to ArrangingPayment, so later steps never re-read the variant.
    async onTransitionEnd(_fromState, toState, { ctx, order }) {
        if (toState !== 'ArrangingPayment') return;
        await connection.getRepository(ctx, OrderLine).query(
            `UPDATE order_line l SET "customFieldsOrganizationid" = v."customFieldsOrganizationid"
             FROM product_variant v
             WHERE v.id = l."productVariantId" AND l."orderId" = $1`,
            [order.id],
        );
    },
};
