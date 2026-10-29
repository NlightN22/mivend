import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { gql } from '../orders/helpers';

// Seed: BAT-90-AGM has zero stock and is on sale; every seeded product is new (created by the seed run).
interface SeedProduct {
    sku: string;
    slug: string;
}
const fixtures = join(__dirname, '../../../../infrastructure/fixtures');
const outOfStockSku = (
    JSON.parse(readFileSync(join(fixtures, 'stock.json'), 'utf8')) as {
        sku: string;
        stockOnHand: number;
    }[]
).find(row => row.stockOnHand === 0)?.sku;
const outOfStockSlug = (
    JSON.parse(readFileSync(join(fixtures, 'products.json'), 'utf8')) as SeedProduct[]
).find(product => product.sku === outOfStockSku)?.slug;

const WIDGET_QUERIES = {
    newArrivalProductIds: `{ newArrivalProductIds(take: 50, sinceDays: 7) }`,
    saleProductIds: `{ saleProductIds(take: 50) }`,
    popularProductIds: `{ popularProductIds(take: 50) }`,
} as const;

async function widgetIds(page: Page, field: keyof typeof WIDGET_QUERIES): Promise<string[]> {
    return (await gql(page, WIDGET_QUERIES[field]))[field] as string[];
}

async function inStockProductIds(page: Page): Promise<Set<string>> {
    const result = await gql(
        page,
        `{ search(input: { take: 100, inStock: true }) { items { productId } } }`,
    );
    const items = (result.search as { items: { productId: string }[] }).items;
    return new Set(items.map(item => item.productId));
}

async function outOfStockProductId(page: Page): Promise<string> {
    const result = await gql(page, `query($slug: String!) { product(slug: $slug) { id } }`, {
        slug: outOfStockSlug,
    });
    return (result.product as { id: string }).id;
}

test.describe('Home widgets only offer products in stock at the viewer branch', () => {
    test('the seed has an out-of-stock product on sale', () => {
        expect(outOfStockSlug).toBeTruthy();
    });

    for (const field of ['newArrivalProductIds', 'saleProductIds'] as const) {
        test(`${field}: non-empty, only in-stock products, never the out-of-stock one`, async ({
            page,
        }) => {
            const ids = await widgetIds(page, field);
            const inStock = await inStockProductIds(page);

            expect(ids.length).toBeGreaterThan(0);
            expect(ids.filter(id => !inStock.has(id))).toEqual([]);
            expect(ids).not.toContain(await outOfStockProductId(page));
        });
    }

    test('popularProductIds: only in-stock products', async ({ page }) => {
        const ids = await widgetIds(page, 'popularProductIds');
        const inStock = await inStockProductIds(page);

        expect(ids.filter(id => !inStock.has(id))).toEqual([]);
    });

    test('New Arrivals and On Sale cards never link to the out-of-stock product', async ({
        page,
    }) => {
        await page.goto('/');

        for (const name of ['New Arrivals', 'On Sale']) {
            const heading = page.getByRole('heading', { name });
            await expect(heading).toBeVisible({ timeout: 10000 });
            const section = page.locator('section.psr', { has: heading });
            await expect(section.locator('.psr-card').first()).toBeVisible({ timeout: 20000 });
            await expect(section.locator(`a[href*="${outOfStockSlug}"]`)).toHaveCount(0);
        }
    });

    test('the New Arrivals widget hides itself when nothing qualifies, the others stay', async ({
        page,
    }) => {
        await page.route('**/shop-api**', async route => {
            const body = route.request().postData() ?? '';
            if (!body.includes('newArrivalProductIds')) return route.fallback();
            return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify({ data: { newArrivalProductIds: [] } }),
            });
        });
        await page.goto('/');

        await expect(page.getByRole('heading', { name: 'On Sale' })).toBeVisible({
            timeout: 10000,
        });
        await expect(page.getByRole('heading', { name: 'New Arrivals' })).toHaveCount(0);
    });
});
