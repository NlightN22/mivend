import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { clearCart, gql, searchInStock } from './helpers';

const AUTH_STATE_PATH = path.join(__dirname, '../../.auth/storefront-user.json');

interface OrderState {
    myOrders: { items: { code: string; state: string }[] };
}

async function addOneItemToCart(page: Page): Promise<void> {
    const variantId = await searchInStock(page);
    await gql(
        page,
        `mutation($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 1) { __typename } }`,
        { id: variantId },
    );
}

async function latestOrderState(page: Page): Promise<string | undefined> {
    // Vendure-generated type (see shop.schema.ts); no `sort` needed.
    // ErpOrderResolver always orders by createdAt DESC server-side.
    const result = (await gql(
        page,
        `{ myOrders(options: { take: 1 }) { items { code state } } }`,
    )) as unknown as OrderState;
    return result.myOrders.items[0]?.state;
}

// Drives the real checkout/payment-stub buttons, not gql(): the bug was in the click path,
// which skipped the order transition that myOrders needs (AddingItems orders are hidden).
test.describe('Checkout places a real order (regression)', () => {
    test('cash payment moves the order out of AddingItems and it appears in /orders @smoke', async ({
        page,
    }) => {
        await clearCart(page);
        await addOneItemToCart(page);

        await page.goto('/checkout');
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: /^Cash/i }).click();
        await page.getByRole('button', { name: 'Place order' }).click();

        await expect(page).toHaveURL(/\/order-created\?code=/, { timeout: 15000 });
        await expect(page.getByText(/Waiting for the manager to confirm/).first()).toBeVisible();

        const state = await latestOrderState(page);
        expect(state).not.toBe('AddingItems');

        await page.goto('/orders');
        await expect(page.getByRole('heading', { name: 'My Orders' })).toBeVisible({
            timeout: 20000,
        });
        await expect(page.locator('.order-card').first()).toBeVisible({ timeout: 10000 });

        await page.context().storageState({ path: AUTH_STATE_PATH });
    });

    test('proforma invoice payment moves the order out of AddingItems and it appears in /orders', async ({
        page,
    }) => {
        await clearCart(page);
        await addOneItemToCart(page);

        await page.goto('/checkout');
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: /Bank proforma invoice/i }).click();
        await page.getByRole('button', { name: 'Place order & get proforma invoice' }).click();

        await expect(page).toHaveURL(/\/order-created\?code=/, { timeout: 15000 });

        const state = await latestOrderState(page);
        expect(state).not.toBe('AddingItems');

        await page.context().storageState({ path: AUTH_STATE_PATH });
    });

    test('online payment success settles the order and it appears in /orders', async ({ page }) => {
        await clearCart(page);
        await addOneItemToCart(page);

        await page.goto('/checkout');
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: /Card online/i }).click();
        await page.getByRole('button', { name: 'Pay online →' }).click();

        await expect(page).toHaveURL(/\/payment-stub/, { timeout: 15000 });
        await page.getByRole('button', { name: /Payment successful/i }).click();

        await expect(page).toHaveURL(/\/payment-result\?status=success/, { timeout: 15000 });

        const state = await latestOrderState(page);
        expect(state).toBe('PaymentSettled');

        await page.context().storageState({ path: AUTH_STATE_PATH });
    });

    test('online payment failure keeps the order in ArrangingPayment, not AddingItems', async ({
        page,
    }) => {
        await clearCart(page);
        await addOneItemToCart(page);

        await page.goto('/checkout');
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: /Card online/i }).click();
        await page.getByRole('button', { name: 'Pay online →' }).click();

        await expect(page).toHaveURL(/\/payment-stub/, { timeout: 15000 });
        await page.getByRole('button', { name: /Payment failed/i }).click();

        await expect(page).toHaveURL(/\/payment-result\?status=fail/, { timeout: 15000 });

        const state = await latestOrderState(page);
        expect(state).toBe('ArrangingPayment');

        await page.context().storageState({ path: AUTH_STATE_PATH });
    });
});
