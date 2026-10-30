import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { gql, clearCart, addItem, orderStep } from '../orders/helpers';
import { placeViaApi } from '../checkout-credit/helpers';
import { finishOrdersPlacedInEachTest } from '../order-cleanup';

finishOrdersPlacedInEachTest();

const stockRows = JSON.parse(
    readFileSync(join(__dirname, '../../../../infrastructure/fixtures/stock.json'), 'utf8'),
) as { sku: string; stockOnHand: number }[];
const SEED_STOCK = Object.fromEntries(stockRows.map(row => [row.sku, row.stockOnHand]));
const DRAIN_SKU = 'BAT-60-AGM';
const OUT_BADGE = /out of stock/i;

function widget(page: Page, name: string): Locator {
    return page.locator('section.psr', { has: page.getByRole('heading', { name }) });
}

async function openHome(page: Page, names: string[]): Promise<void> {
    await page.goto('/');
    for (const name of names) {
        await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 15000 });
        await expect(widget(page, name).locator('.psr-card').first()).toBeVisible({
            timeout: 20000,
        });
    }
}

async function variantBySku(page: Page, sku: string): Promise<{ variantId: string; slug: string }> {
    const result = await gql(
        page,
        `query($t: String!) { search(input: { term: $t, take: 5 }) { items { sku productVariantId slug } } }`,
        { t: sku },
    );
    const items = (
        result.search as { items: { sku: string; productVariantId: string; slug: string }[] }
    ).items;
    const hit = items.find(item => item.sku === sku);
    if (!hit) throw new Error(`${sku} not found in search`);
    return { variantId: hit.productVariantId, slug: hit.slug };
}

async function slugsOfIds(page: Page, ids: string[]): Promise<string[]> {
    const result = await gql(
        page,
        `query($ids: [String!]!) { products(options: { take: 100, filter: { id: { in: $ids } } }) { items { id slug } } }`,
        { ids },
    );
    const items = (result.products as { items: { id: string; slug: string }[] }).items;
    const byId = new Map(items.map(item => [item.id, item.slug]));
    return ids.map(id => byId.get(id)).filter((slug): slug is string => !!slug);
}

test.describe('Home widgets, customer view', () => {
    test('every card of every widget is in stock and shows a stock badge', async ({ page }) => {
        await openHome(page, ['New Arrivals', 'On Sale']);

        for (const name of ['New Arrivals', 'On Sale']) {
            const cards = widget(page, name).locator('.psr-card');
            await expect(cards.filter({ hasText: OUT_BADGE })).toHaveCount(0);
            await expect(cards.first().locator('.mv-product-card__stock-badge')).toBeVisible();
        }
    });

    test('New Arrivals cards follow the server order, newest first', async ({ page }) => {
        const ids = (await gql(page, `{ newArrivalProductIds(take: 12, sinceDays: 7) }`))
            .newArrivalProductIds as string[];
        const expected = (await slugsOfIds(page, ids)).slice(0, 12);
        expect(expected.length).toBeGreaterThan(1);

        await openHome(page, ['New Arrivals']);
        const hrefs = await widget(page, 'New Arrivals')
            .locator('.psr-card .mv-product-card__name')
            .evaluateAll(links => links.map(link => link.getAttribute('href') ?? ''));

        expect(hrefs.slice(0, expected.length)).toEqual(expected.map(slug => `/product/${slug}`));
    });

    test('a card links to its product page', async ({ page }) => {
        await openHome(page, ['New Arrivals']);
        const link = widget(page, 'New Arrivals')
            .locator('.psr-card .mv-product-card__name')
            .first();
        const href = (await link.getAttribute('href')) ?? '';
        await link.click();
        await expect(page).toHaveURL(new RegExp(`${href}$`));
    });

    test('add to cart works from a widget card', async ({ page }) => {
        await clearCart(page);
        try {
            await openHome(page, ['On Sale']);
            const buy = widget(page, 'On Sale').locator('.psr-card .mv-product-card__buy').first();
            await buy.click();
            await expect
                .poll(
                    async () =>
                        (
                            (await gql(page, `{ activeOrder { totalQuantity } }`)).activeOrder as {
                                totalQuantity: number;
                            } | null
                        )?.totalQuantity ?? 0,
                )
                .toBeGreaterThan(0);
        } finally {
            await clearCart(page);
        }
    });

    test('a product whose stock is fully reserved leaves the widgets after reload', async ({
        page,
    }) => {
        const { variantId, slug } = await variantBySku(page, DRAIN_SKU);
        await clearCart(page);
        const product = (await gql(page, `query($slug: String!) { product(slug: $slug) { id } }`, {
            slug,
        })) as { product: { id: string } };
        const stock = SEED_STOCK[DRAIN_SKU];
        expect(stock).toBeGreaterThan(0);
        const widgetIds = async (): Promise<string[]> => {
            const ids = await gql(
                page,
                `{ newArrivalProductIds(take: 50, sinceDays: 7) saleProductIds(take: 50) }`,
            );
            return [...(ids.newArrivalProductIds as string[]), ...(ids.saleProductIds as string[])];
        };
        expect(await widgetIds()).toContain(product.product.id);

        await addItem(page, variantId, Math.ceil(stock / (await orderStep(page, variantId))));
        const placed = await placeViaApi(page, 'cash');
        expect(placed).toMatchObject({ typename: 'Order' });

        await expect.poll(widgetIds).not.toContain(product.product.id);
        await openHome(page, ['New Arrivals']);
        await expect(page.locator(`section.psr a[href$="/${slug}"]`)).toHaveCount(0);
    });
});

test.describe('Home widgets, guest view', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('a guest has no branch, so no stock-scoped widget is offered, only the catalog', async ({
        page,
    }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Full catalog' })).toBeVisible({
            timeout: 15000,
        });
        await expect(page.locator('section.psr')).toHaveCount(0, { timeout: 20000 });
        const { slug } = await variantBySku(page, 'BAT-90-AGM');
        await expect(page.locator(`a[href$="/${slug}"]`)).toHaveCount(0);
    });
});
