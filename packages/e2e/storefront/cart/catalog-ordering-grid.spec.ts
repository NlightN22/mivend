import { test, expect, type Page } from '@playwright/test';

const BADGE = '.app-header__cart-badge';
const CARD = '.mv-product-card';
const CARD_BUY_BTN = '.mv-product-card__buy';
const CARD_STEPPER = '.mv-product-card__stepper';
const STEPPER_VAL = '.mv-qty-stepper__val';
const STEPPER_INC = '.mv-qty-stepper__btn:last-child';
const STEPPER_DEC = '.mv-qty-stepper__btn:first-child';
async function clearCart(page: Page): Promise<void> {
    const url = `${process.env.STOREFRONT_URL ?? 'http://localhost:5173'}/shop-api`;
    await page.request.post(url, {
        data: { query: 'mutation { transitionOrderToState(state: "AddingItems") { __typename } }' },
        headers: { 'Content-Type': 'application/json' },
    });
    await page.request.post(url, {
        data: { query: 'mutation { removeAllOrderLines { __typename } }' },
        headers: { 'Content-Type': 'application/json' },
    });
}

async function switchToGrid(page: Page): Promise<void> {
    await page.getByRole('button', { name: /Grid/ }).click();
    await expect(page.locator(CARD).first()).toBeVisible({ timeout: 5000 });
}

function firstCard(page: Page) {
    return page.locator(CARD).first();
}

test.describe('Catalog grid — cart ordering', () => {
    test.beforeEach(async ({ page }) => {
        await clearCart(page);
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.mv-product-row').first()).toBeVisible({ timeout: 10000 });
        await switchToGrid(page);
    });

    test('"Add to cart" button is shown for product not in cart', async ({ page }) => {
        await expect(firstCard(page).locator(CARD_BUY_BTN)).toBeVisible();
        await expect(firstCard(page).locator(CARD_STEPPER)).not.toBeVisible();
    });

    test('clicking "Add to cart" replaces button with stepper showing qty 1', async ({ page }) => {
        await firstCard(page).locator(CARD_BUY_BTN).click();
        await expect(firstCard(page).locator(CARD_STEPPER)).toBeVisible({ timeout: 5000 });
        await expect(firstCard(page).locator(CARD_STEPPER).locator(STEPPER_VAL)).toHaveText('1');
        await expect(firstCard(page).locator(CARD_BUY_BTN)).not.toBeVisible();
    });

    test('cart badge shows position count, not total qty', async ({ page }) => {
        await firstCard(page).locator(CARD_BUY_BTN).click();
        await expect(firstCard(page).locator(CARD_STEPPER)).toBeVisible({ timeout: 5000 });
        await expect(page.locator(BADGE)).toHaveText('1');

        // Increase qty to 3 — badge must stay 1
        await firstCard(page).locator(CARD_STEPPER).locator(STEPPER_INC).click();
        await expect(firstCard(page).locator(CARD_STEPPER).locator(STEPPER_VAL)).toHaveText('2');
        await firstCard(page).locator(CARD_STEPPER).locator(STEPPER_INC).click();
        await expect(firstCard(page).locator(CARD_STEPPER).locator(STEPPER_VAL)).toHaveText('3');
        await expect(page.locator(BADGE)).toHaveText('1');
    });

    test('+ increments qty', async ({ page }) => {
        await firstCard(page).locator(CARD_BUY_BTN).click();
        await expect(firstCard(page).locator(CARD_STEPPER)).toBeVisible({ timeout: 5000 });

        await firstCard(page).locator(CARD_STEPPER).locator(STEPPER_INC).click();
        await expect(firstCard(page).locator(CARD_STEPPER).locator(STEPPER_VAL)).toHaveText('2');
    });

    test('− decrements qty', async ({ page }) => {
        await firstCard(page).locator(CARD_BUY_BTN).click();
        await expect(firstCard(page).locator(CARD_STEPPER)).toBeVisible({ timeout: 5000 });

        await firstCard(page).locator(CARD_STEPPER).locator(STEPPER_INC).click();
        await expect(firstCard(page).locator(CARD_STEPPER).locator(STEPPER_VAL)).toHaveText('2');

        await firstCard(page).locator(CARD_STEPPER).locator(STEPPER_DEC).click();
        await expect(firstCard(page).locator(CARD_STEPPER).locator(STEPPER_VAL)).toHaveText('1');
    });

    test('− at qty 1 removes product and restores "Add to cart" button', async ({ page }) => {
        await firstCard(page).locator(CARD_BUY_BTN).click();
        await expect(firstCard(page).locator(CARD_STEPPER)).toBeVisible({ timeout: 5000 });
        await expect(page.locator(BADGE)).toHaveText('1');

        await firstCard(page).locator(CARD_STEPPER).locator(STEPPER_DEC).click();

        await expect(firstCard(page).locator(CARD_BUY_BTN)).toBeVisible({ timeout: 5000 });
        await expect(firstCard(page).locator(CARD_STEPPER)).not.toBeVisible();
        await expect(page.locator(BADGE)).toHaveText('0');
    });
});
