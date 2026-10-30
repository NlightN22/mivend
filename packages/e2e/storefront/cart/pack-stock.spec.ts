import { test, expect, type Locator, type Page } from '@playwright/test';
import { clearCart } from '../orders/helpers';
import { favoriteTarget, seedFavorites } from '../favorites/favorites-helpers';
import { PACK_STOCK_SKU, PACK_STOCK_UNIT, setupPackStock } from './pack-stock-helpers';

async function openRow(page: Page): Promise<Locator> {
    await page.addInitScript(() => localStorage.setItem('mivend.locale', 'ru'));
    await page.goto('/catalog');
    await clearCart(page);
    await seedFavorites(page, [await favoriteTarget(page, PACK_STOCK_SKU)]);
    await page.goto('/favorites');
    const row = page.locator('.mv-product-row', { hasText: PACK_STOCK_SKU });
    await expect(row).toBeVisible({ timeout: 20000 });
    return row;
}

test.describe('Packs-only stock (#300)', () => {
    test('fewer base units than one pack shows as out of stock', async ({ page }) => {
        const setup = setupPackStock(20);
        try {
            const row = await openRow(page);
            await expect(row).toContainText('Нет в наличии');
        } finally {
            setup.restore();
        }
    });

    test('with one pack in stock the second pack is refused in packs', async ({ page }) => {
        const setup = setupPackStock(50);
        try {
            const row = await openRow(page);
            await row.getByRole('button', { name: /Добавить/ }).click();
            await expect(row.locator('.mv-qty-stepper__val')).toHaveValue('1');
            await row.locator('.mv-qty-stepper__btn:last-child').click();
            await expect(page.locator('.mv-toast')).toContainText(
                `Доступно только 1 ${PACK_STOCK_UNIT}`,
                {
                    timeout: 10000,
                },
            );
        } finally {
            await clearCart(page);
            setup.restore();
        }
    });
});
