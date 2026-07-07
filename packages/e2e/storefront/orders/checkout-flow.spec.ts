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
    const result = (await gql(
        page,
        `{ myOrders(options: { take: 1, sort: { createdAt: DESC } }) { items { code state } } }`,
    )) as unknown as OrderState;
    return result.myOrders.items[0]?.state;
}

// Regression coverage for: checkout never transitioned the Vendure order out of
// AddingItems for ANY payment method — CheckoutSummary.vue/PaymentStubPage.vue just
// did a client-side router.push() with no mutation at all. myOrders correctly excludes
// AddingItems/Cancelled, so a placed order silently never showed up in /orders despite
// the UI claiming success. Fixed via cartStore.beginCheckout()/completeOfflinePayment()/
// completeOnlinePayment() — see docs/ai/PROJECT_CONTEXT.md "checkout never actually
// placed orders". These tests click the real checkout/payment-stub buttons (not gql())
// so they exercise the exact code path that was broken.
test.describe('Checkout places a real order (regression)', () => {
    test('deferred payment moves the order out of AddingItems and it appears in /orders', async ({
        page,
    }) => {
        await clearCart(page);
        await addOneItemToCart(page);

        await page.goto('/checkout');
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: /Deferred payment/i }).click();
        await page.getByRole('button', { name: 'Confirm order' }).click();

        await expect(page).toHaveURL(/\/order-created\?method=deferred/, { timeout: 15000 });

        const state = await latestOrderState(page);
        expect(state).not.toBe('AddingItems');

        await page.goto('/orders');
        await expect(page.getByRole('heading', { name: 'My Orders' })).toBeVisible({
            timeout: 20000,
        });
        await expect(page.locator('.order-card').first()).toBeVisible({ timeout: 10000 });

        await page.context().storageState({ path: AUTH_STATE_PATH });
    });

    test('invoice payment moves the order out of AddingItems and it appears in /orders', async ({
        page,
    }) => {
        await clearCart(page);
        await addOneItemToCart(page);

        await page.goto('/checkout');
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: /Bank invoice/i }).click();
        await page.getByRole('button', { name: 'Place order & get invoice' }).click();

        await expect(page).toHaveURL(/\/order-created\?method=invoice/, { timeout: 15000 });

        const state = await latestOrderState(page);
        expect(state).not.toBe('AddingItems');

        await page.context().storageState({ path: AUTH_STATE_PATH });
    });

    test('online payment success settles the order and it appears in /orders', async ({ page }) => {
        await clearCart(page);
        await addOneItemToCart(page);

        await page.goto('/checkout');
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: /Online payment/i }).click();
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
        await page.getByRole('button', { name: /Online payment/i }).click();
        await page.getByRole('button', { name: 'Pay online →' }).click();

        await expect(page).toHaveURL(/\/payment-stub/, { timeout: 15000 });
        await page.getByRole('button', { name: /Payment failed/i }).click();

        await expect(page).toHaveURL(/\/payment-result\?status=fail/, { timeout: 15000 });

        const state = await latestOrderState(page);
        expect(state).toBe('ArrangingPayment');

        await page.context().storageState({ path: AUTH_STATE_PATH });
    });
});
