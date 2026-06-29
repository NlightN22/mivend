import { test, expect, type Page } from '@playwright/test';

const BADGE = '.app-header__cart-badge';
const CART_ITEM = '.cart-item';
const STEPPER = '.mv-qty-stepper';
const STEPPER_VAL = '.mv-qty-stepper__val';
const STEPPER_INC = '.mv-qty-stepper__btn:last-child';
const STEPPER_DEC = '.mv-qty-stepper__btn:first-child';
const CONFIRM = '.cart-item__remove-confirm';
const CONFIRM_YES = '.cart-item__remove-confirm-yes';
const CONFIRM_NO = '.cart-item__remove-confirm-no';

async function clearCart(page: Page): Promise<void> {
    await page.request.post('http://localhost:3000/shop-api', {
        data: { query: 'mutation { removeAllOrderLines { __typename } }' },
        headers: { 'Content-Type': 'application/json' },
    });
}

async function addToCartFromCatalog(page: Page, count = 1): Promise<void> {
    await page.goto('/catalog');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.mv-product-row').first()).toBeVisible({ timeout: 10000 });
    for (let i = 0; i < count; i++) {
        const row = page.locator('.mv-product-row').nth(i);
        await row.getByRole('button', { name: '+ Add' }).click();
        await expect(row.locator(STEPPER)).toBeVisible({ timeout: 5000 });
    }
}

async function openCart(page: Page): Promise<void> {
    await page.goto('/cart');
    await page.waitForLoadState('networkidle');
    await expect(page.locator(CART_ITEM).first()).toBeVisible({ timeout: 10000 });
}

function firstItem(page: Page) {
    return page.locator(CART_ITEM).first();
}

test.describe('Cart page — ordering', () => {
    test.beforeEach(async ({ page }) => {
        await clearCart(page);
        await addToCartFromCatalog(page, 1);
        await openCart(page);
    });

    test('added product appears in cart with qty 1', async ({ page }) => {
        await expect(firstItem(page).locator(STEPPER_VAL)).toHaveText('1');
        await expect(firstItem(page).locator(CONFIRM)).not.toBeVisible();
    });

    test('+ increments qty on cart page', async ({ page }) => {
        await firstItem(page).locator(STEPPER_INC).click();
        await expect(firstItem(page).locator(STEPPER_VAL)).toHaveText('2');
    });

    test('− decrements qty on cart page', async ({ page }) => {
        await firstItem(page).locator(STEPPER_INC).click();
        await expect(firstItem(page).locator(STEPPER_VAL)).toHaveText('2');
        await firstItem(page).locator(STEPPER_DEC).click();
        await expect(firstItem(page).locator(STEPPER_VAL)).toHaveText('1');
    });

    test('− at qty 1 shows remove confirmation instead of deleting', async ({ page }) => {
        await firstItem(page).locator(STEPPER_DEC).click();

        await expect(firstItem(page).locator(CONFIRM)).toBeVisible({ timeout: 3000 });
        await expect(firstItem(page).locator(STEPPER)).not.toBeVisible();
        // Item still in cart — not removed yet
        await expect(firstItem(page)).toBeVisible();
    });

    test('confirming remove deletes item from cart; badge clears', async ({ page }) => {
        await firstItem(page).locator(STEPPER_DEC).click();
        await expect(firstItem(page).locator(CONFIRM)).toBeVisible({ timeout: 3000 });

        await firstItem(page).locator(CONFIRM_YES).click();

        await expect(page.locator(CART_ITEM)).toHaveCount(0, { timeout: 5000 });
        await expect(page.locator(BADGE)).toHaveText('0');
    });

    test('cancelling remove keeps item with stepper restored', async ({ page }) => {
        await firstItem(page).locator(STEPPER_DEC).click();
        await expect(firstItem(page).locator(CONFIRM)).toBeVisible({ timeout: 3000 });

        await firstItem(page).locator(CONFIRM_NO).click();

        await expect(firstItem(page).locator(CONFIRM)).not.toBeVisible();
        await expect(firstItem(page).locator(STEPPER)).toBeVisible();
        await expect(firstItem(page).locator(STEPPER_VAL)).toHaveText('1');
        await expect(page.locator(BADGE)).toHaveText('1');
    });

    test('badge shows position count when multiple products added', async ({ page }) => {
        // Add a second distinct product (first is already in cart from beforeEach)
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.mv-product-row').first()).toBeVisible({ timeout: 10000 });
        const secondRow = page.locator('.mv-product-row').nth(1);
        await secondRow.getByRole('button', { name: '+ Add' }).click();
        await expect(secondRow.locator(STEPPER)).toBeVisible({ timeout: 5000 });

        await openCart(page);
        const itemCount = await page.locator(CART_ITEM).count();
        await expect(page.locator(BADGE)).toHaveText(String(itemCount));
    });

    test('badge stays consistent after incrementing qty of existing item', async ({ page }) => {
        const badgeBefore = await page.locator(BADGE).textContent();

        await firstItem(page).locator(STEPPER_INC).click();
        await expect(firstItem(page).locator(STEPPER_VAL)).toHaveText('2');

        await expect(page.locator(BADGE)).toHaveText(badgeBefore ?? '1');
    });
});
