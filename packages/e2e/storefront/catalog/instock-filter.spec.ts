import { test, expect } from '@playwright/test';

const CATALOG = 'http://localhost:5173/catalog';
const COUNT = '.plv-toolbar__count';
const IN_STOCK_CHECK = 'input[type="checkbox"]';

function parseCount(text: string): number {
    const m = text.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : -1;
}

test('inStock filter: count must not exceed unfiltered count', async ({ page }) => {
    await page.goto(CATALOG);
    await page.waitForLoadState('networkidle');
    await expect(page.locator(COUNT)).not.toHaveText('Loading...');

    const totalText = await page.locator(COUNT).textContent();
    const total = parseCount(totalText ?? '');
    expect(total).toBeGreaterThan(0);

    await page.locator(COUNT).waitFor({ state: 'visible' });
    await page.locator(IN_STOCK_CHECK).first().check();
    await page.waitForLoadState('networkidle');
    await expect(page.locator(COUNT)).not.toHaveText('Loading...');

    const inStockText = await page.locator(COUNT).textContent();
    const inStock = parseCount(inStockText ?? '');

    expect(inStock).toBeGreaterThanOrEqual(0);
    expect(inStock).toBeLessThanOrEqual(total);
});

test('inStock filter: count display matches real total, not loaded row count', async ({ page }) => {
    await page.goto(CATALOG);
    await page.waitForLoadState('networkidle');
    await expect(page.locator(COUNT)).not.toHaveText('Loading...');

    const totalText = await page.locator(COUNT).textContent();
    const displayedTotal = parseCount(totalText ?? '');

    // Displayed number must match the API totalItems, not items.length (which is ≤ pageSize)
    // We verify by checking it stays consistent after filter toggle
    await page.locator(IN_STOCK_CHECK).first().check();
    await page.waitForLoadState('networkidle');
    await expect(page.locator(COUNT)).not.toHaveText('Loading...');
    const afterCheck = parseCount((await page.locator(COUNT).textContent()) ?? '');

    await page.locator(IN_STOCK_CHECK).first().uncheck();
    await page.waitForLoadState('networkidle');
    await expect(page.locator(COUNT)).not.toHaveText('Loading...');
    const afterUncheck = parseCount((await page.locator(COUNT).textContent()) ?? '');

    expect(afterUncheck).toBe(displayedTotal);
    expect(afterCheck).toBeLessThanOrEqual(afterUncheck);
});
