import { keepCustomerSession } from './customer-session';
import { test, expect } from '@playwright/test';
import { clearCart } from '../storefront/orders/helpers';
import { pickMixedCart, type CartLine } from './cart-picker';
import { literal, select } from './contour-db';
import { placedOrder, waitForErpAnswer, waitForOrder, waitForPublished } from './erp-wait';
import {
    mismatchIssues,
    orderByCode,
    outboxRows,
    reservations,
    variantIdsByProductId,
} from './order-rows';
import { addLine, fillCart, openCheckout } from './storefront-flow';
import { readRun } from './run-state';

test.describe.configure({ timeout: 10 * 60_000 });
keepCustomerSession();

function mainOrder(): { id: string; code: string } {
    const order = readRun().orders[0];
    test.skip(!order, 'scenario 1 placed no order');
    return order;
}

test('mixed cart: a variant without free stock is refused or limited', async ({ page }) => {
    const picked = await pickMixedCart(page);
    test.skip(!picked.noStockVariantId, 'no searched variant without free stock in the branch');
    await clearCart(page);
    const added = await addLine(page, picked.noStockVariantId as string, 1_000_000);
    expect(added.typename !== 'Order' || added.quantity < 1_000_000, JSON.stringify(added)).toBe(
        true,
    );
    await clearCart(page);
});

test('1: placement reserves and publishes exactly one order.confirmed', async ({ page }) => {
    const picked = await pickMixedCart(page);
    const cart: CartLine[] = picked.lines;
    for (const reason of picked.skipped)
        test.info().annotations.push({ type: 'variety skipped', description: reason });
    await fillCart(page, cart);
    await openCheckout(page);
    // Double submit: the placement trigger repeated by the UI must still create one order.
    await page.getByRole('button', { name: /^Place order/ }).dblclick();
    await expect(page).toHaveURL(/\/order-created\?code=/, { timeout: 60_000 });
    const code = new URL(page.url()).searchParams.get('code') as string;
    const order = await placedOrder(code);
    expect(order.code).toMatch(/^\d+$/);

    expect(
        (await waitForOrder(code, o => o.reservationState === 'RESERVED'))?.reservationState,
    ).toBe('RESERVED');
    const reserved = reservations(order.id).filter(r => r.status === 'active');
    for (const line of cart) {
        const sum = reserved
            .filter(r => r.productVariantId === line.variantId)
            .reduce((s, r) => s + r.quantity, 0);
        expect(sum, `reserved quantity of variant ${line.variantId}`).toBe(line.quantity);
    }
    const confirmed = await waitForPublished(order.uuid, 'order.confirmed');
    expect(confirmed.filter(r => r.status === 'published')).toHaveLength(1);
});

test('1: the ERP registration sets erpOrderId and erpStatus', async () => {
    const { code } = mainOrder();
    const order = orderByCode(code);
    await waitForErpAnswer('order-registration-result', order?.uuid as string);
    const registered = await waitForOrder(
        code,
        o => !!o.erpOrderId && !!o.erpStatus && o.erpStatus !== 'PENDING',
    );
    expect(registered?.erpOrderId).toBeTruthy();
    expect(['PENDING', 'REJECTED']).not.toContain(registered?.erpStatus);
});

test('2: repeating the placement in the UI keeps one order, one publish, one erpOrderId', async ({
    page,
}) => {
    const { code } = mainOrder();
    const before = orderByCode(code);
    await page.goto(`/order-created?code=${code}`);
    await page.reload();
    await page.goBack();
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible({
        timeout: 30_000,
    });

    const placedByRun = select<{ code: string }>(`SELECT o.code FROM "order" o
        WHERE o."customerId" = (SELECT "customerId" FROM "order" WHERE code = ${literal(code)})
        AND o."orderPlacedAt" IS NOT NULL AND o.id >= ${literal(mainOrder().id)}`).map(o => o.code);
    expect(placedByRun.filter(c => !readRun().orders.some(o => o.code === c))).toEqual([]);
    const rows = outboxRows(before?.uuid as string, 'order.confirmed');
    expect(rows.filter(r => r.status === 'published')).toHaveLength(1);
    expect(rows.filter(r => r.status !== 'published' && r.status !== 'skipped')).toEqual([]);
    expect(orderByCode(code)?.erpOrderId).toBe(before?.erpOrderId);
});

test('3: registration reservedQuantity matches local reservations or a QUANTITY_MISMATCH is recorded', async () => {
    const { id, code } = mainOrder();
    const order = orderByCode(code);
    const result = await waitForErpAnswer('order-registration-result', order?.uuid as string);
    test.skip(result.payload.status === 'rejected', 'the ERP rejected the order');
    const lines = result.payload.reservedLines ?? [];
    const variantByProduct = variantIdsByProductId(lines.map(l => l.productId));
    const rows = reservations(id);
    const generation = Math.max(...rows.map(r => r.generation));
    const issues = mismatchIssues(id);
    for (const line of lines) {
        const variantId = variantByProduct.get(line.productId) as string;
        const own = rows.filter(
            r => r.productVariantId === variantId && r.generation === generation,
        );
        const local = own.reduce((s, r) => s + r.quantity, 0);
        const handedOver = own.filter(r => r.handedOver).reduce((s, r) => s + r.quantity, 0);
        const erp = Math.round(line.reservedQuantity ?? 0);
        const issue = issues.find(i => i.productVariantId === variantId);
        if (erp === local) {
            expect(issue, `no mismatch for variant ${variantId}`).toBeUndefined();
            expect(handedOver).toBe(local);
        } else {
            expect(issue, `mismatch recorded for variant ${variantId}`).toMatchObject({
                localQuantity: local,
                erpQuantity: erp,
            });
            expect(handedOver).toBe(Math.min(erp, local));
        }
    }
});
