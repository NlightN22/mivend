import type { Injector, OrderProcess, OrderState } from '@vendure/core';
import { OrderLine, TransactionalConnection } from '@vendure/core';

export const ORGANIZATION_MISSING_MESSAGE =
    'Some items cannot be ordered right now. Remove them from the cart to continue: ';

let connection: TransactionalConnection;

async function missingSkus(orderId: unknown): Promise<string[]> {
    const rows: Array<{ sku: string }> = await connection.rawConnection.query(
        `SELECT v.sku FROM order_line l
         INNER JOIN product_variant v ON v.id = l."productVariantId"
         WHERE l."orderId" = $1 AND v."customFieldsOrganizationid" IS NULL
         ORDER BY l.id`,
        [orderId],
    );
    return rows.map(row => row.sku);
}

// Blocks checkout for everyone and every payment method: addPaymentToOrder needs ArrangingPayment.
export const organizationOrderGuard: OrderProcess<OrderState> = {
    init(injector: Injector) {
        connection = injector.get(TransactionalConnection);
    },
    async onTransitionStart(_fromState, toState, { order }) {
        if (toState !== 'ArrangingPayment') return;
        const skus = await missingSkus(order.id);
        if (skus.length === 0) return;
        return ORGANIZATION_MISSING_MESSAGE + skus.join(', ');
    },
    // Re-stamped on every entry to ArrangingPayment, so later steps never re-read the variant. One
    // statement stamps only organizations read now; a variant cleared since onTransitionStart
    // leaves its line unstamped and fails the transition (the invariant must hold at stamp time).
    async onTransitionEnd(_fromState, toState, { ctx, order }) {
        if (toState !== 'ArrangingPayment') return;
        const rows: Array<{ missing: number }> = await connection
            .getRepository(ctx, OrderLine)
            .query(
                `WITH stamped AS (
                 UPDATE order_line l SET "customFieldsOrganizationid" = v."customFieldsOrganizationid"
                 FROM product_variant v
                 WHERE v.id = l."productVariantId" AND l."orderId" = $1
                   AND v."customFieldsOrganizationid" IS NOT NULL
                 RETURNING l.id
             )
             SELECT (SELECT count(*) FROM order_line WHERE "orderId" = $1)::int
                    - (SELECT count(*) FROM stamped)::int AS missing`,
                [order.id],
            );
        if (Number(rows[0]?.missing) > 0) {
            throw new Error(
                ORGANIZATION_MISSING_MESSAGE + (await missingSkus(order.id)).join(', '),
            );
        }
    },
};
