import { test, expect } from '@playwright/test';
import { clearCart, gql, searchInStock } from './helpers';

interface ActiveOrderState {
    activeOrder: { id: string; state: string } | null;
}

// Regression test for: a customer whose activeOrder was left in ArrangingPayment
// (transitioned mid-checkout but never settled — e.g. they backed out of payment,
// or a payment-stub "fail" click) was permanently blocked from adding anything new
// to the cart. Vendure's addItemToOrder rejects with ORDER_MODIFICATION_ERROR
// outside AddingItems, and the storefront just showed a generic "Could not add
// item to cart" toast with no recovery. Fixed in stores/cart.ts's addItem(): on
// ORDER_MODIFICATION_ERROR it now transitions the order back to AddingItems (safe,
// since it was never actually paid) and retries once. See
// docs/ai/PROJECT_CONTEXT.md, live repro via ivan@autoservice-nord.example.
test.describe('Cart recovers from an order stuck in ArrangingPayment', () => {
    test('add-to-cart succeeds without an error toast after a prior abandoned checkout', async ({
        page,
    }) => {
        await clearCart(page);
        const variantId = await searchInStock(page);

        await gql(
            page,
            `mutation($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 1) { __typename } }`,
            { id: variantId },
        );
        const methodsData = await gql(page, `{ eligibleShippingMethods { id } }`);
        const methodId = (methodsData.eligibleShippingMethods as { id: string }[])[0]?.id;
        await gql(
            page,
            `mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { __typename } }`,
            { id: [methodId] },
        );
        await gql(
            page,
            `mutation { transitionOrderToState(state: "ArrangingPayment") { __typename } }`,
        );

        const stuck = (await gql(
            page,
            `{ activeOrder { id state } }`,
        )) as unknown as ActiveOrderState;
        expect(stuck.activeOrder?.state).toBe('ArrangingPayment');

        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.mv-product-row').first()).toBeVisible({ timeout: 10000 });
        await page.getByRole('button', { name: '+ Add' }).first().click();

        const errorToast = page.locator('.mv-toast', { hasText: 'Could not add item to cart' });
        await expect(errorToast).not.toBeVisible({ timeout: 5000 });

        const recovered = (await gql(
            page,
            `{ activeOrder { id state } }`,
        )) as unknown as ActiveOrderState;
        expect(recovered.activeOrder?.state).toBe('AddingItems');
    });
});
