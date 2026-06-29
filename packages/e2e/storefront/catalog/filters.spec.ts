import { test, expect } from '@playwright/test';

async function waitForProducts(page: import('@playwright/test').Page): Promise<void> {
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.mv-product-row').first()).toBeVisible({ timeout: 10000 });
    // wait for auto-loadMore to settle
    await page.waitForTimeout(800);
    await page.waitForLoadState('networkidle');
}

async function getRowCount(page: import('@playwright/test').Page): Promise<number> {
    return page.locator('.mv-product-row').count();
}

test.describe('Catalog filters', () => {
    test('catalog page loads and shows products', async ({ page }) => {
        await page.goto('/catalog');
        await waitForProducts(page);

        await expect(page).not.toHaveURL('/login');
        await expect(page.locator('.mv-product-row').first()).toBeVisible();
    });

    test('in-stock filter: checking reduces or keeps result count', async ({ page }) => {
        await page.goto('/catalog');
        await waitForProducts(page);
        const countBefore = await getRowCount(page);

        await page.getByLabel('In stock only').check();
        await waitForProducts(page);
        const countAfter = await getRowCount(page);

        expect(countAfter).toBeLessThanOrEqual(countBefore);
        expect(countAfter).toBeGreaterThan(0);
    });

    test('in-stock filter: unchecking shows more results than filtered', async ({ page }) => {
        await page.goto('/catalog');
        await waitForProducts(page);

        await page.getByLabel('In stock only').check();
        await waitForProducts(page);
        const countFiltered = await getRowCount(page);

        await page.getByLabel('In stock only').uncheck();
        await waitForProducts(page);
        const countRestored = await getRowCount(page);

        // After removing filter, count should be >= filtered (server returns more results)
        expect(countRestored).toBeGreaterThanOrEqual(countFiltered);
    });

    test('facet filter: selecting reduces results, deselecting restores', async ({ page }) => {
        await page.goto('/catalog');
        await waitForProducts(page);
        const countBefore = await getRowCount(page);

        const facetCheckboxes = page
            .locator('.catalog-facets__block')
            .filter({ hasNot: page.locator('label:has-text("In stock only")') })
            .locator('input[type="checkbox"]');

        if ((await facetCheckboxes.count()) === 0) {
            test.skip();
            return;
        }

        await facetCheckboxes.first().check();
        await page.waitForLoadState('networkidle');
        const countAfter = await getRowCount(page);
        expect(countAfter).toBeLessThanOrEqual(countBefore);

        await facetCheckboxes.first().uncheck();
        await waitForProducts(page);
        const countRestored = await getRowCount(page);
        expect(countRestored).toBeGreaterThanOrEqual(countAfter);
    });

    test('reset filters restores products and unchecks in-stock', async ({ page }) => {
        await page.goto('/catalog');
        await waitForProducts(page);

        await page.getByLabel('In stock only').check();
        await waitForProducts(page);
        const countFiltered = await getRowCount(page);

        await page.getByRole('button', { name: 'Reset filters' }).click();
        await waitForProducts(page);
        const countAfterReset = await getRowCount(page);

        expect(countAfterReset).toBeGreaterThanOrEqual(countFiltered);
        await expect(page.getByLabel('In stock only')).not.toBeChecked();
    });
});
