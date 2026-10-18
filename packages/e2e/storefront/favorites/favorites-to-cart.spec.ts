import { test, expect, type Page } from '@playwright/test';
import { clearCart } from '../orders/helpers';
import {
    PACK_SIZE,
    PACK_SKU,
    PIECE_SKU,
    cartLines,
    favoriteTarget,
    seedFavorites,
    setupPackSales,
    type PackSetup,
} from './favorites-helpers';

const ADD_BTN = '+ Add';
const STEPPER_VAL = '.mv-qty-stepper__val';
const STEPPER_INC = '.mv-qty-stepper__btn:last-child';

async function openFavoritesWith(page: Page, skus: string[]): Promise<void> {
    await page.goto('/catalog');
    await clearCart(page);
    const targets = await Promise.all(skus.map(s => favoriteTarget(page, s)));
    await seedFavorites(page, targets);
    await page.goto('/favorites');
    await expect(page.locator('.mv-product-row').first()).toBeVisible({ timeout: 20000 });
}

function rowFor(page: Page, sku: string): ReturnType<Page['locator']> {
    return page.locator('.mv-product-row', { hasText: sku });
}

async function qtyOf(page: Page, sku: string): Promise<number | undefined> {
    return (await cartLines(page)).find(l => l.sku === sku)?.quantity;
}

for (const packagesOnly of [false, true]) {
    test.describe(`Favorites → cart, ${packagesOnly ? 'pack-only' : 'piece'} sales`, () => {
        let setup: PackSetup;

        test.beforeAll(() => {
            setup = setupPackSales(packagesOnly);
        });
        test.afterAll(() => {
            setup.restore();
        });
        test.afterEach(async ({ page }) => {
            await clearCart(page);
        });

        test('adding a pack-sized favorite from its row', async ({ page }) => {
            await openFavoritesWith(page, [PACK_SKU]);
            await rowFor(page, PACK_SKU).getByRole('button', { name: ADD_BTN }).click();
            await expect(rowFor(page, PACK_SKU).locator(STEPPER_VAL)).toHaveValue('1');
            expect(await qtyOf(page, PACK_SKU)).toBe(packagesOnly ? PACK_SIZE : 1);
        });

        test('stepper adds one more unit of the sales view', async ({ page }) => {
            await openFavoritesWith(page, [PACK_SKU]);
            await rowFor(page, PACK_SKU).getByRole('button', { name: ADD_BTN }).click();
            await expect(rowFor(page, PACK_SKU).locator(STEPPER_VAL)).toHaveValue('1');
            await rowFor(page, PACK_SKU).locator(STEPPER_INC).click();
            await expect(rowFor(page, PACK_SKU).locator(STEPPER_VAL)).toHaveValue('2');
            await expect.poll(() => qtyOf(page, PACK_SKU)).toBe(packagesOnly ? 2 * PACK_SIZE : 2);
        });

        test('a plain product is added by the piece in either mode', async ({ page }) => {
            await openFavoritesWith(page, [PIECE_SKU]);
            await rowFor(page, PIECE_SKU).getByRole('button', { name: ADD_BTN }).click();
            await expect(rowFor(page, PIECE_SKU).locator(STEPPER_VAL)).toHaveValue('1');
            expect(await qtyOf(page, PIECE_SKU)).toBe(1);
        });

        test('"Add available to cart" adds every favorite in its own unit', async ({ page }) => {
            await openFavoritesWith(page, [PACK_SKU, PIECE_SKU]);
            await page.getByRole('button', { name: /^Add \d+ available to cart$/ }).click();
            await expect.poll(async () => (await cartLines(page)).length).toBe(2);
            expect(await qtyOf(page, PACK_SKU)).toBe(packagesOnly ? PACK_SIZE : 1);
            expect(await qtyOf(page, PIECE_SKU)).toBe(1);
        });

        test('the cart page shows what the favorites row added', async ({ page }) => {
            await openFavoritesWith(page, [PACK_SKU]);
            await rowFor(page, PACK_SKU).getByRole('button', { name: ADD_BTN }).click();
            await expect(rowFor(page, PACK_SKU).locator(STEPPER_VAL)).toHaveValue('1');
            await page.goto('/cart');
            await expect(page.locator('.cart-item', { hasText: PACK_SKU })).toBeVisible({
                timeout: 15000,
            });
            await expect(page.locator('.app-header__cart-badge')).toHaveText('1');
        });
    });
}
