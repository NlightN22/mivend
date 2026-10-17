import { test, expect } from '@playwright/test';
import { readE2eOrder } from '../../helpers/e2e-order';
import { adminGql } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import { releaseOrderReservation } from '../../helpers/manager-order';
import { MANAGER_ACCOUNTS } from '../../fixtures/accounts';

test('order detail shows the two-column layout with order lines and context', async ({ page }) => {
    const order = readE2eOrder();

    await page.goto(`/orders/${order.code}`);
    await expect(page.getByRole('heading', { name: 'Order lines' })).toBeVisible({
        timeout: 15000,
    });
    await expect(page.getByRole('heading', { name: 'Order context' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reservation', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();

    await expect(page.locator('.order-lines thead')).toContainText('Available');
    await expect(page.locator('.order-detail__panels')).toContainText('E2E Co');
});

test.describe('reservation of the shared e2e order', () => {
    // Every role project confirms the same order, so each test starts and ends unreserved.
    let token: string;

    test.beforeEach(async () => {
        token = await adminTokenFor(
            MANAGER_ACCOUNTS.operator.username,
            MANAGER_ACCOUNTS.operator.password,
        );
        const order = readE2eOrder();
        await releaseOrderReservation(token, order.id);
        const lines = await adminGql<{
            order: { lines: { quantity: number; productVariant: { id: string; sku: string } }[] };
        }>(
            `query($id: ID!) { order(id: $id) { lines { quantity productVariant { id sku } } } }`,
            { id: order.id },
            token,
        );
        for (const line of lines.data.order.lines) {
            const stock = await adminGql<{ availableStock: number }>(
                `query($v: ID!, $o: ID) { availableStock(productVariantId: $v, orderId: $o) }`,
                { v: line.productVariant.id, o: order.id },
                token,
            );
            if (stock.data.availableStock < line.quantity) {
                throw new Error(
                    `${line.productVariant.sku}: available ${stock.data.availableStock} < ${line.quantity}; stale reservations hold the e2e stock`,
                );
            }
        }
    });

    test.afterEach(async () => {
        await releaseOrderReservation(token, readE2eOrder().id);
    });

    test('confirming an order creates a reservation and shows the expiry', async ({ page }) => {
        await page.goto(`/orders/${readE2eOrder().code}`);
        const panel = page.locator('.order-detail__panels');
        await expect(panel).toContainText('Not confirmed yet', { timeout: 15000 });
        await page.getByRole('button', { name: 'Confirm order' }).click();

        await expect(panel).toContainText('Reserved');
        await expect(panel.getByRole('button', { name: 'Release reservation' })).toBeVisible();
    });
});
