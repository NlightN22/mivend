import { test, expect } from '@playwright/test';
import { addItem, clearCart, gql, searchInStock } from './helpers';
import { finishOrdersPlacedInEachTest } from '../order-cleanup';

finishOrdersPlacedInEachTest();

interface ActiveOrderState {
    activeOrder: { id: string; state: string } | null;
}

// Vendure rejects addItemToOrder outside AddingItems, so the order is moved back before the retry.
// Safe only because an order stuck in ArrangingPayment has never been paid.
test.describe('Cart recovers from an order stuck in ArrangingPayment', () => {
    test('add-to-cart succeeds without an error toast after a prior abandoned checkout', async ({
        page,
    }) => {
        await clearCart(page);
        const variantId = await searchInStock(page);

        await addItem(page, variantId);
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
