import { test, expect, type Page } from '@playwright/test';
import { gql, clearCart, searchInStock } from '../orders/helpers';

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

// Mirrors orders/helpers.ts's placeTestOrder, but for a caller-chosen variant
// instead of an arbitrary in-stock one — needed here so the order line and the
// `popularProductIds` assertion are guaranteed to be about the same product.
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

// Regression coverage for plugin-popular-products' `popularProductIds` query —
// see docs/ai/PROJECT_CONTEXT.md "plugin-popular-products, #23". The ranking
// aggregates real OrderLine quantity across all customers, so exact position
// can't be asserted deterministically against a shared dev DB with unknown
// prior activity — these tests instead assert the two invariants that matter:
// (1) an order still in AddingItems must never affect the ranking, and
// (2) completing a real order for a product can only improve (never worsen)
// its rank.
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
        const { variantId, productId } = await searchInStockWithProductId(page);

        const before = await popularProductIds(page);
        const rankBefore = before.indexOf(productId);
        const positionBefore = rankBefore === -1 ? Infinity : rankBefore;

        // ArrangingPayment already counts as a real sale for ranking purposes
        // (same exclusion list as myOrders: only AddingItems/Cancelled are
        // excluded) — no need to complete payment for this test.
        await placeOrderForVariant(page, variantId, 5);

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
