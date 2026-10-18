import { keepCustomerSession } from './customer-session';
import { test, expect } from '@playwright/test';
import { pickMixedCart } from './cart-picker';
import { restartContour, UNREACHABLE_SCHEMA_REGISTRY } from './contour-control';
import { placedOrder, waitForOrder } from './erp-wait';
import { orderByCode, outboxRows, reservations } from './order-rows';
import { select, literal } from './contour-db';
import { cancelInStorefront, fillCart, placeOrderInCheckout } from './storefront-flow';

test.describe.configure({ timeout: 25 * 60_000 });
keepCustomerSession();

// The contour runs with an unreachable schema registry, so order.confirmed cannot leave the outbox.
test('5: cancel before order.confirmed leaves the outbox: row skipped, Cancelled, released, nothing published', async ({
    page,
}) => {
    await restartContour(UNREACHABLE_SCHEMA_REGISTRY);
    try {
        const { lines } = await pickMixedCart(page);
        await fillCart(page, lines.slice(0, 1));
        const order = await placedOrder(await placeOrderInCheckout(page));
        expect(
            (await waitForOrder(order.code, o => o.reservationState === 'RESERVED'))
                ?.reservationState,
        ).toBe('RESERVED');
        expect(outboxRows(order.uuid, 'order.confirmed').map(r => r.status)).toEqual(['pending']);

        await cancelInStorefront(page, order.id);
        const final = await waitForOrder(order.code, o => o.state === 'Cancelled');
        expect(final?.state).toBe('Cancelled');
        expect(outboxRows(order.uuid, 'order.confirmed').map(r => r.status)).toEqual(['skipped']);
        expect(reservations(order.id).filter(r => r.status === 'active')).toEqual([]);
        const published = select<{ event_type: string }>(`SELECT event_type FROM integration_outbox
            WHERE payload->>'orderUuid' = ${literal(order.uuid)} AND status = 'published'`);
        expect(published).toEqual([]);
        expect(orderByCode(order.code)?.erpOrderId ?? null).toBeNull();
    } finally {
        await restartContour();
    }
});
