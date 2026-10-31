import { test, expect, type Page } from '@playwright/test';
import { gql, clearCart, searchInStock } from '../orders/helpers';
import { finishOrdersPlacedInEachTest } from '../order-cleanup';

finishOrdersPlacedInEachTest();

async function popularProductIds(page: Page, take = 500): Promise<string[]> {
    const result = await gql(page, `query($take: Int!) { popularProductIds(take: $take) }`, {
        take,
    });
    return result.popularProductIds as string[];
}

async function searchInStockWithProductId(
    page: Page,
): Promise<{ variantId: string; productId: string }> {
    const result = await gql(
        page,
        `{ search(input: { take: 1, inStock: true }) { items { productId productVariantId } } }`,
    );
    const items = (result.search as { items: { productId: string; productVariantId: string }[] })
        .items;
    if (!items.length) throw new Error('No in-stock products found');
    return { variantId: items[0].productVariantId, productId: items[0].productId };
}

// Caller-chosen variant, not an arbitrary in-stock one: the order line and the
// popularProductIds assertion must refer to the same product.
async function placeOrderForVariant(
    page: Page,
    variantId: string,
    quantity: number,
): Promise<void> {
    await clearCart(page);
    await gql(
        page,
        `mutation($id: ID!, $qty: Int!) { addItemToOrder(productVariantId: $id, quantity: $qty) { __typename } }`,
        { id: variantId, qty: quantity },
    );
    const methods = await gql(page, `{ eligibleShippingMethods { id } }`);
    const methodId = (methods.eligibleShippingMethods as { id: string }[])[0]?.id;
    if (methodId) {
        await gql(
            page,
            `mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { __typename } }`,
            { id: [methodId] },
        );
    }
    await gql(
        page,
        `mutation { transitionOrderToState(state: "ArrangingPayment") { __typename } }`,
    );
}

// Exact rank can't be asserted: popularProductIds sums OrderLine quantities across all
// customers on a shared dev DB with unknown prior activity, so only invariants are checked.
test.describe('Popular products ranking reflects real orders', () => {
    test('an order left in AddingItems does not affect the popularity ranking', async ({
        page,
    }) => {
        const before = await popularProductIds(page);

        await clearCart(page);
        const variantId = await searchInStock(page);
        await gql(
            page,
            `mutation($id: ID!, $qty: Int!) { addItemToOrder(productVariantId: $id, quantity: $qty) { __typename } }`,
            { id: variantId, qty: 5 },
        );
        // Deliberately not transitioned/paid — order stays in AddingItems.

        const after = await popularProductIds(page);
        expect(after).toEqual(before);
    });

    test('completing a real order for a product can only improve its ranking position', async ({
        page,
    }) => {
        test.setTimeout(120_000);
        const { variantId, productId } = await searchInStockWithProductId(page);

        const before = await popularProductIds(page);
        const rankBefore = before.indexOf(productId);
        const positionBefore = rankBefore === -1 ? Infinity : rankBefore;

        // ArrangingPayment already counts as a sale for ranking (only AddingItems/Cancelled are
        // excluded, same as myOrders), so payment does not need to be completed.
        await placeOrderForVariant(page, variantId, 5);

        // The server caches the ranking per channel for up to a minute.
        await expect
            .poll(() => popularProductIds(page), { timeout: 90_000, intervals: [2000] })
            .toContain(productId);
        const after = await popularProductIds(page);
        const rankAfter = after.indexOf(productId);
        const positionAfter = rankAfter === -1 ? Infinity : rankAfter;

        expect(positionAfter).toBeLessThanOrEqual(positionBefore);
        expect(after).toContain(productId);
    });
});

test.describe('Homepage renders the Popular products widget', () => {
    test('shows a real, non-empty carousel of ranked products', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const heading = page.getByRole('heading', { name: 'Popular products' });
        await expect(heading).toBeVisible({ timeout: 10000 });

        const section = page.locator('section.psr', { has: heading });
        await expect(section.locator('.psr-card').first()).toBeVisible({ timeout: 10000 });
    });
});
