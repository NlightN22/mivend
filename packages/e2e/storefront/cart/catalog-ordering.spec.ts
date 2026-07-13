import { test, expect, type Page, type Locator } from '@playwright/test';

const ADD_BTN = '+ Add';
const BADGE = '.app-header__cart-badge';
const STEPPER = '.mv-qty-stepper';
const STEPPER_VAL = '.mv-qty-stepper__val';
const STEPPER_INC = '.mv-qty-stepper__btn:last-child';
const STEPPER_DEC = '.mv-qty-stepper__btn:first-child';
const FIRST_ROW = '.mv-product-row:first-of-type';

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

async function openCatalog(page: Page): Promise<void> {
    await page.goto('/catalog');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.mv-product-row').first()).toBeVisible({ timeout: 10000 });
}

function firstRowStepper(page: Page): Locator {
    return page.locator(FIRST_ROW).locator(STEPPER);
}

function firstRowAddBtn(page: Page): Locator {
    return page.locator(FIRST_ROW).getByRole('button', { name: ADD_BTN });
}

test.describe('Catalog — cart ordering', () => {
    test.beforeEach(async ({ page }) => {
        await clearCart(page);
        await openCatalog(page);
        // Reload so catalog reflects empty cart state
        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.mv-product-row').first()).toBeVisible({ timeout: 10000 });
    });

    test('Add button is shown for product not in cart', async ({ page }) => {
        await expect(firstRowAddBtn(page)).toBeVisible();
        await expect(firstRowStepper(page)).not.toBeVisible();
    });

    test('clicking Add replaces button with stepper showing qty 1', async ({ page }) => {
        await firstRowAddBtn(page).click();
        await expect(firstRowStepper(page)).toBeVisible({ timeout: 5000 });
        await expect(firstRowStepper(page).locator(STEPPER_VAL)).toHaveText('1');
        await expect(firstRowAddBtn(page)).not.toBeVisible();
    });

    test('cart badge shows position count, not total qty', async ({ page }) => {
        // Add first product
        await firstRowAddBtn(page).click();
        await expect(firstRowStepper(page)).toBeVisible({ timeout: 5000 });
        await expect(page.locator(BADGE)).toHaveText('1');

        // Increase qty to 3 — badge must stay 1 (positions, not units)
        await firstRowStepper(page).locator(STEPPER_INC).click();
        await expect(firstRowStepper(page).locator(STEPPER_VAL)).toHaveText('2');
        await firstRowStepper(page).locator(STEPPER_INC).click();
        await expect(firstRowStepper(page).locator(STEPPER_VAL)).toHaveText('3');
        await expect(page.locator(BADGE)).toHaveText('1');
    });

    test('badge increments by 1 when second distinct product added', async ({ page }) => {
        await firstRowAddBtn(page).click();
        await expect(firstRowStepper(page)).toBeVisible({ timeout: 5000 });
        await expect(page.locator(BADGE)).toHaveText('1');

        // Add second product (second row)
        const secondRowAddBtn = page
            .locator('.mv-product-row')
            .nth(1)
            .getByRole('button', { name: ADD_BTN });
        await secondRowAddBtn.click();
        await expect(page.locator('.mv-product-row').nth(1).locator(STEPPER)).toBeVisible({
            timeout: 5000,
        });
        await expect(page.locator(BADGE)).toHaveText('2');
    });

    test('+ button increments qty in stepper', async ({ page }) => {
        await firstRowAddBtn(page).click();
        await expect(firstRowStepper(page)).toBeVisible({ timeout: 5000 });

        await firstRowStepper(page).locator(STEPPER_INC).click();
        await expect(firstRowStepper(page).locator(STEPPER_VAL)).toHaveText('2');

        await firstRowStepper(page).locator(STEPPER_INC).click();
        await expect(firstRowStepper(page).locator(STEPPER_VAL)).toHaveText('3');
    });

    test('− button decrements qty in stepper', async ({ page }) => {
        await firstRowAddBtn(page).click();
        await expect(firstRowStepper(page)).toBeVisible({ timeout: 5000 });

        await firstRowStepper(page).locator(STEPPER_INC).click();
        await expect(firstRowStepper(page).locator(STEPPER_VAL)).toHaveText('2');
        await firstRowStepper(page).locator(STEPPER_INC).click();
        await expect(firstRowStepper(page).locator(STEPPER_VAL)).toHaveText('3');

        await firstRowStepper(page).locator(STEPPER_DEC).click();
        await expect(firstRowStepper(page).locator(STEPPER_VAL)).toHaveText('2');
    });

    test('− at qty 1 removes product and restores Add button; badge clears', async ({ page }) => {
        await firstRowAddBtn(page).click();
        await expect(firstRowStepper(page)).toBeVisible({ timeout: 5000 });
        await expect(page.locator(BADGE)).toHaveText('1');

        // Decrement to 0 — catalog removes line immediately (no confirm dialog in catalog)
        await firstRowStepper(page).locator(STEPPER_DEC).click();

        await expect(firstRowAddBtn(page)).toBeVisible({ timeout: 5000 });
        await expect(firstRowStepper(page)).not.toBeVisible();
        // Badge stays in DOM but shows 0 when cart is empty
        await expect(page.locator(BADGE)).toHaveText('0');
    });

    test('− at qty 2 goes to 1, not removed', async ({ page }) => {
        await firstRowAddBtn(page).click();
        await expect(firstRowStepper(page)).toBeVisible({ timeout: 5000 });

        await firstRowStepper(page).locator(STEPPER_INC).click();
        await expect(firstRowStepper(page).locator(STEPPER_VAL)).toHaveText('2', { timeout: 5000 });

        await firstRowStepper(page).locator(STEPPER_DEC).click();
        await expect(firstRowStepper(page).locator(STEPPER_VAL)).toHaveText('1', { timeout: 5000 });
        await expect(firstRowStepper(page)).toBeVisible();
        await expect(firstRowAddBtn(page)).not.toBeVisible();
    });
});
