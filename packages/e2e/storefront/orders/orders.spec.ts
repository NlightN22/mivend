import { test, expect, type Page } from '@playwright/test';

const STOREFRONT = process.env.STOREFRONT_URL ?? 'http://localhost:5173';

async function gql(
    page: Page,
    query: string,
    variables?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const res = await page.request.post(`${STOREFRONT}/shop-api`, {
        data: { query, variables },
        headers: { 'Content-Type': 'application/json' },
    });
    const body = (await res.json()) as { data?: Record<string, unknown>; errors?: unknown[] };
    if (body.errors) throw new Error(JSON.stringify(body.errors));
    return body.data ?? {};
}

async function clearCart(page: Page): Promise<void> {
    // If order is not in AddingItems, transition back first
    await gql(
        page,
        `
        mutation {
            transitionOrderToState(state: "AddingItems") { __typename }
        }
    `,
    ).catch(() => {
        /* ignore if already in AddingItems or no active order */
    });
    await gql(page, 'mutation { removeAllOrderLines { __typename } }');
}

async function searchInStock(page: Page): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const result = await gql(
                page,
                `
                query { search(input: { take: 1, inStock: true }) { items { productVariantId } } }
            `,
            );
            const items = (result.search as { items: { productVariantId: string }[] }).items;
            if (items.length) return items[0].productVariantId;
        } catch {
            // ES index may not be ready yet — wait and retry
        }
        await new Promise(r => setTimeout(r, 3000));
    }
    throw new Error('No in-stock products found after retries');
}

async function placeTestOrder(page: Page): Promise<string> {
    await clearCart(page);

    const variantId = await searchInStock(page);

    await gql(
        page,
        `
        mutation AddItem($id: ID!) {
            addItemToOrder(productVariantId: $id, quantity: 1) { __typename }
        }
    `,
        { id: variantId },
    );

    await gql(
        page,
        `
        mutation SetAddress {
            setOrderShippingAddress(input: {
                fullName: "E2E Test",
                streetLine1: "Test Street 1",
                city: "Test City",
                countryCode: "RU"
            }) { __typename }
        }
    `,
    );

    const methodsData = await gql(
        page,
        `
        query { eligibleShippingMethods { id name } }
    `,
    );
    const methods = methodsData.eligibleShippingMethods as { id: string; name: string }[];
    if (methods.length > 0) {
        await gql(
            page,
            `
            mutation SetMethod($id: [ID!]!) {
                setOrderShippingMethod(shippingMethodId: $id) { __typename }
            }
        `,
            { id: [methods[0].id] },
        );
    }

    await gql(
        page,
        `
        mutation Transition($state: String!) {
            transitionOrderToState(state: $state) { __typename }
        }
    `,
        { state: 'ArrangingPayment' },
    );

    const ordersData = await gql(
        page,
        `
        query {
            myOrders(options: { take: 1, sort: { createdAt: DESC } }) {
                items { id code }
            }
        }
    `,
    );
    const orders = (ordersData.myOrders as { items: { id: string; code: string }[] }).items;
    return orders[0]?.id ?? '';
}

async function goToOrders(page: Page): Promise<void> {
    await page.goto('/orders');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'My Orders' })).toBeVisible({ timeout: 20000 });
}

test.describe('Orders page', () => {
    test('orders page loads and shows title', async ({ page }) => {
        await goToOrders(page);
    });

    test('orders page shows filter chips', async ({ page }) => {
        await goToOrders(page);
        await expect(page.getByRole('button', { name: 'All orders' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'In progress' })).toBeVisible();
    });

    test('placed order appears in orders list', async ({ page }) => {
        await placeTestOrder(page);
        await goToOrders(page);
        await expect(page.locator('.order-card').first()).toBeVisible({ timeout: 10000 });
    });

    test('order card shows ERP status badge', async ({ page }) => {
        await goToOrders(page);
        const firstCard = page.locator('.order-card').first();
        await expect(firstCard).toBeVisible({ timeout: 10000 });
        await expect(firstCard.locator('.status-pill')).toBeVisible();
    });

    test('Open button navigates to order detail page', async ({ page }) => {
        await goToOrders(page);
        await expect(page.locator('.order-card').first()).toBeVisible({ timeout: 10000 });
        await page.locator('.order-card').first().getByRole('link', { name: 'Open' }).click();
        await expect(page).toHaveURL(/\/orders\/[a-zA-Z0-9]+$/, { timeout: 10000 });
    });
});

test.describe('Order detail page', () => {
    let orderId: string;

    test.beforeAll(async ({ browser }) => {
        // auth path is relative to e2e package root (where playwright.config.ts lives)
        const ctx = await browser.newContext({
            storageState: '.auth/storefront-user.json',
        });
        const page = await ctx.newPage();
        orderId = await placeTestOrder(page);
        await ctx.close();
    });

    test('detail page shows order code', async ({ page }) => {
        await page.goto(`/orders/${orderId}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.od-title')).toBeVisible({ timeout: 10000 });
        const title = await page.locator('.od-title').textContent();
        expect(title).toMatch(/Order\s+[A-Z0-9-]+/);
    });

    test('detail page shows order lines', async ({ page }) => {
        await page.goto(`/orders/${orderId}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.od-row').first()).toBeVisible({ timeout: 10000 });
    });

    test('detail page shows summary totals', async ({ page }) => {
        await page.goto(`/orders/${orderId}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.od-summary-total')).toBeVisible({ timeout: 10000 });
    });

    test('back link returns to orders list', async ({ page }) => {
        await page.goto(`/orders/${orderId}`);
        await page.waitForLoadState('domcontentloaded');
        await page.locator('.od-back').click();
        await expect(page).toHaveURL(/\/orders$/, { timeout: 10000 });
    });
});
