import { test, expect, type Page } from '@playwright/test';
import { clearCart, addItem } from '../orders/helpers';
import { PIECE_SKU, favoriteTarget, seedFavorites } from './favorites-helpers';

const HEART = 'Toggle favorite';
const FAV_BADGE = '.app-header__fav-badge';

async function openFavorites(page: Page): Promise<void> {
    await page.goto('/favorites');
    await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible({ timeout: 20000 });
}

async function seedOne(page: Page): Promise<void> {
    await seedFavorites(page, [await favoriteTarget(page, PIECE_SKU)]);
}

test.describe('Favorites — heart in every place', () => {
    test('home popular row: add and remove, header badge follows', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        const row = page.locator('.mv-product-row, .mv-product-card').first();
        await expect(row).toBeVisible({ timeout: 15000 });
        const heart = row.getByLabel(HEART);

        await heart.click();
        await expect(heart).toHaveClass(/mv-favorite-btn--active/);
        await expect(page.locator(FAV_BADGE)).toHaveText('1');

        await heart.click();
        await expect(heart).not.toHaveClass(/mv-favorite-btn--active/);
        await expect(page.locator(FAV_BADGE)).toHaveCount(0);
    });

    test('catalog list: removing a favorite via the heart clears it from favorites', async ({
        page,
    }) => {
        await seedOne(page);
        await page.goto(`/catalog?q=${PIECE_SKU}`);
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: 'List' }).click();
        const active = page.locator('.mv-product-row .mv-favorite-btn--active');
        await expect(active).toHaveCount(1, { timeout: 15000 });
        await active.first().click();
        await expect(active).toHaveCount(0);

        await openFavorites(page);
        await expect(page.locator('.favorites-page__empty')).toBeVisible();
    });

    test('catalog grid: favorite seeded earlier shows an active heart', async ({ page }) => {
        await seedOne(page);
        await page.goto(`/catalog?q=${PIECE_SKU}`);
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: 'Grid' }).click();
        await expect(page.locator('.mv-product-card .mv-favorite-btn--active')).toHaveCount(1, {
            timeout: 15000,
        });
    });

    test('cart line heart adds and removes the favorite', async ({ page }) => {
        await page.goto('/catalog');
        await clearCart(page);
        const target = await favoriteTarget(page, PIECE_SKU);
        await addItem(page, target.variantId);

        await page.goto('/cart');
        const line = page.locator('.cart-item').first();
        await expect(line).toBeVisible({ timeout: 15000 });
        const heart = line.getByLabel(HEART);
        await expect(heart).not.toHaveClass(/mv-favorite-btn--active/);

        await heart.click();
        await expect(heart).toHaveClass(/mv-favorite-btn--active/);
        await openFavorites(page);
        await expect(page.locator('.favorites-page__empty')).not.toBeVisible();

        await page.goto('/cart');
        await page.locator('.cart-item').first().getByLabel(HEART).click();
        await openFavorites(page);
        await expect(page.locator('.favorites-page__empty')).toBeVisible();
        await clearCart(page);
    });

    test('favorites page: removing the only favorite shows the empty state and clears the badge', async ({
        page,
    }) => {
        await seedOne(page);
        await openFavorites(page);
        const row = page.locator('.mv-product-row, .mv-product-card').first();
        await expect(row).toBeVisible({ timeout: 15000 });
        await expect(page.locator(FAV_BADGE)).toHaveText('1');

        await row.getByLabel(HEART).click();
        await expect(page.locator('.favorites-page__empty')).toBeVisible();
        await expect(page.locator(FAV_BADGE)).toHaveCount(0);
    });
});
