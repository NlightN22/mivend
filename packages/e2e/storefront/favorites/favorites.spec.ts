import { test, expect } from '@playwright/test';

async function goToFavorites(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/favorites');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible({ timeout: 20000 });
}

async function goToCatalogGridView(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/catalog');
    await page.waitForLoadState('networkidle');
    // Favorites toggle only exists on MvProductCard, used in grid view (list is the default).
    await page.getByRole('button', { name: 'Grid' }).click();
    await expect(page.locator('.mv-product-card').first()).toBeVisible({ timeout: 10000 });
}

async function addFirstCatalogProductToFavorites(
    page: import('@playwright/test').Page,
): Promise<void> {
    await goToCatalogGridView(page);
    await page.locator('.mv-product-card').first().getByLabel('Toggle favorite').click();
}

test.describe('Favorites', () => {
    test('favorites page shows empty state when no favorites', async ({ page }) => {
        await goToFavorites(page);
        await expect(page.locator('.favorites-page__empty')).toBeVisible();
    });

    test('adding a product from catalog shows it on favorites page', async ({ page }) => {
        await addFirstCatalogProductToFavorites(page);
        await goToFavorites(page);
        await expect(page.locator('.favorites-page__empty')).not.toBeVisible();
        await expect(page.locator('.fav-card').first()).toBeVisible({ timeout: 10000 });
    });

    test('favorite persists across page reload', async ({ page }) => {
        await addFirstCatalogProductToFavorites(page);
        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        await goToFavorites(page);
        await expect(page.locator('.favorites-page__empty')).not.toBeVisible();
    });

    test('removing a favorite clears it from the list', async ({ page }) => {
        await addFirstCatalogProductToFavorites(page);
        await goToFavorites(page);
        await expect(page.locator('.favorites-page__empty')).not.toBeVisible();

        await page.getByLabel('Remove from favorites').first().click();
        await expect(page.locator('.favorites-page__empty')).toBeVisible({ timeout: 10000 });
    });

    test('catalog heart icon reflects favorited state', async ({ page }) => {
        await goToCatalogGridView(page);
        const card = page.locator('.mv-product-card').first();
        const heart = card.getByLabel('Toggle favorite');

        await expect(heart).not.toHaveClass(/mv-favorite-btn--active/);
        await heart.click();
        await expect(heart).toHaveClass(/mv-favorite-btn--active/, { timeout: 10000 });

        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(card.getByLabel('Toggle favorite')).toHaveClass(/mv-favorite-btn--active/, {
            timeout: 10000,
        });
    });

    test('list view heart icon toggles favorite too', async ({ page }) => {
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: 'List' }).click();
        const row = page.locator('.mv-product-row').first();
        await expect(row).toBeVisible({ timeout: 10000 });
        const heart = row.getByLabel('Toggle favorite');

        await expect(heart).not.toHaveClass(/mv-favorite-btn--active/);
        await heart.click();
        await expect(heart).toHaveClass(/mv-favorite-btn--active/, { timeout: 10000 });

        await goToFavorites(page);
        await expect(page.locator('.favorites-page__empty')).not.toBeVisible();
    });
});
