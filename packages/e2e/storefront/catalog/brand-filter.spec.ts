import { test, expect, type Page } from '@playwright/test';

const CATALOG = '/catalog';
const COUNT = '.plv-toolbar__count';

async function waitForCount(page: Page): Promise<number> {
    await page.waitForLoadState('networkidle');
    await expect(page.locator(COUNT)).not.toHaveText('Loading...', { timeout: 8000 });
    const text = await page.locator(COUNT).textContent();
    const m = text?.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
}

function brandLabel(page: Page, name: string): ReturnType<Page['locator']> {
    return page.locator('.mv-facet-group__row').filter({ hasText: name }).first();
}

test.describe('Brand filter combinations', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(CATALOG);
        await waitForCount(page);
        // The brand group shows only the first rows until expanded.
        await page
            .locator('.mv-facet-group', { hasText: 'Brand' })
            .locator('.mv-facet-group__toggle')
            .first()
            .click();
    });

    test('brand panel is visible and has multiple brands', async ({ page }) => {
        const brandBlock = page.locator('.catalog-facets__block').filter({ hasText: 'Brand' });
        await expect(brandBlock).toBeVisible();
        const checkboxes = brandBlock.locator('input[type="checkbox"]');
        expect(await checkboxes.count()).toBeGreaterThanOrEqual(2);
    });

    test('selecting one brand reduces product count', async ({ page }) => {
        const total = await waitForCount(page);

        await brandLabel(page, 'Castrol').check();
        const filtered = await waitForCount(page);

        expect(filtered).toBeGreaterThan(0);
        expect(filtered).toBeLessThanOrEqual(total);
    });

    test('all other brands remain visible in sidebar when one is selected', async ({ page }) => {
        const brandBlock = page.locator('.catalog-facets__block').filter({ hasText: 'Brand' });
        const countBefore = await brandBlock.locator('input[type="checkbox"]').count();

        await brandLabel(page, 'Castrol').check();
        await page.waitForLoadState('networkidle');

        const countAfter = await brandBlock.locator('input[type="checkbox"]').count();
        expect(countAfter).toBe(countBefore);
    });

    test('deselecting brand restores original count', async ({ page }) => {
        const total = await waitForCount(page);

        await brandLabel(page, 'Castrol').check();
        await waitForCount(page);

        await brandLabel(page, 'Castrol').uncheck();
        const restored = await waitForCount(page);

        expect(restored).toBe(total);
    });

    test('selecting two brands shows OR result (more than either alone)', async ({ page }) => {
        await brandLabel(page, 'Castrol').check();
        const countA = await waitForCount(page);

        await brandLabel(page, 'Mann').check();
        const countBoth = await waitForCount(page);

        expect(countBoth).toBeGreaterThanOrEqual(countA);
    });

    test('two brands selected: count equals sum when brands are disjoint', async ({ page }) => {
        await brandLabel(page, 'Castrol').check();
        const countCastrol = await waitForCount(page);

        await brandLabel(page, 'Mann').check();
        const countBoth = await waitForCount(page);

        await brandLabel(page, 'Castrol').uncheck();
        const countMann = await waitForCount(page);

        expect(countBoth).toBe(countCastrol + countMann);
    });

    test('deselecting one brand from two leaves the other active', async ({ page }) => {
        await brandLabel(page, 'Castrol').check();
        await waitForCount(page);
        await brandLabel(page, 'Mann').check();
        await waitForCount(page);

        await brandLabel(page, 'Castrol').uncheck();
        const countMannOnly = await waitForCount(page);

        await brandLabel(page, 'Mann').uncheck();
        const countNone = await waitForCount(page);

        expect(countMannOnly).toBeLessThan(countNone);
        await expect(brandLabel(page, 'Mann')).not.toBeChecked();
    });

    test('reset clears all brand filters', async ({ page }) => {
        const total = await waitForCount(page);

        await brandLabel(page, 'Castrol').check();
        await brandLabel(page, 'Mann').check();
        await waitForCount(page);

        await page.getByRole('button', { name: 'Reset filters' }).click();
        const afterReset = await waitForCount(page);

        expect(afterReset).toBe(total);
        await expect(brandLabel(page, 'Castrol')).not.toBeChecked();
        await expect(brandLabel(page, 'Mann')).not.toBeChecked();
    });

    test('brand filter combined with inStock narrows results further', async ({ page }) => {
        await brandLabel(page, 'Castrol').check();
        const countBrand = await waitForCount(page);

        await page.getByLabel('In stock only').check();
        const countBrandAndStock = await waitForCount(page);

        expect(countBrandAndStock).toBeLessThanOrEqual(countBrand);
    });
});
