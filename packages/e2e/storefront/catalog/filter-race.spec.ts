import { test, expect } from '@playwright/test';

const COUNT = '.plv-toolbar__count';

// Cold-mount race: a short result fills the viewport, so the IntersectionObserver sentinel
// fires loadMore() before the first load() resolves, duplicating rows (stale currentSkip=0).
test.describe('Catalog filtered list has no duplicate rows on cold navigation', () => {
    test('collection + facet filter via URL shows each SKU exactly once', async ({ page }) => {
        await page.goto('/catalog?collection=cat-cat-engine&fv=20');
        await page.waitForLoadState('networkidle');
        await expect(page.locator(COUNT)).toBeVisible({ timeout: 10000 });
        await expect(page.locator(COUNT)).not.toHaveText('Loading...', { timeout: 8000 });

        const countText = await page.locator(COUNT).textContent();
        const expectedCount = parseInt(countText?.match(/(\d+)/)?.[1] ?? '0', 10);
        expect(expectedCount).toBeGreaterThan(0);

        const rows = page.locator('.mv-product-row');
        await expect(rows.first()).toBeVisible({ timeout: 10000 });
        // Give any stray loadMore() a moment to (incorrectly) append before counting.
        await page.waitForTimeout(1000);

        const rowCount = await rows.count();
        expect(rowCount).toBe(expectedCount);

        const names = await rows.locator('.mv-product-row__name').allTextContents();
        expect(new Set(names).size).toBe(names.length);
    });
});
