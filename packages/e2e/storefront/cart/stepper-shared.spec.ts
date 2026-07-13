/**
 * Stepper behaviour tests shared across list and grid view modes.
 *
 * Both modes wrap the same MvQtyStepper component and go through
 * the same cart store (adjustItem / removeItem). Running the same
 * scenarios in both modes ensures neither view breaks the contract.
 */
import { test, expect, type Page } from '@playwright/test';

const BADGE = '.app-header__cart-badge';
const STEPPER_VAL = '.mv-qty-stepper__val';
const STEPPER_INC = '.mv-qty-stepper__btn:last-child';
const STEPPER_DEC = '.mv-qty-stepper__btn:first-child';

// List-mode selectors
const LIST_ROW = '.mv-product-row:first-of-type';
const LIST_ADD = '+ Add';
const LIST_STEPPER = `${LIST_ROW} .mv-qty-stepper`;

// Grid-mode selectors
const CARD = '.mv-product-card:first-of-type';
const CARD_ADD = '.mv-product-card__buy';
const CARD_STEPPER = '.mv-product-card__stepper';

async function clearCart(page: Page): Promise<void> {
    const base = process.env.STOREFRONT_URL ?? 'http://localhost:5173';
    const url = `${base}/shop-api`;
    // Transition back to AddingItems if needed (e.g. order left in ArrangingPayment by other tests)
    await page.request.post(url, {
        data: { query: 'mutation { transitionOrderToState(state: "AddingItems") { __typename } }' },
        headers: { 'Content-Type': 'application/json' },
    });
    await page.request.post(url, {
        data: { query: 'mutation { removeAllOrderLines { __typename } }' },
        headers: { 'Content-Type': 'application/json' },
    });
}

async function openCatalogList(page: Page): Promise<void> {
    await page.goto('/catalog');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.mv-product-row').first()).toBeVisible({ timeout: 10000 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.mv-product-row').first()).toBeVisible({ timeout: 10000 });
}

async function openCatalogGrid(page: Page): Promise<void> {
    await openCatalogList(page);
    await page.getByRole('button', { name: /Grid/ }).click();
    await expect(page.locator('.mv-product-card').first()).toBeVisible({ timeout: 5000 });
}

interface StepperCtx {
    add: () => Promise<void>;
    stepper: () => import('@playwright/test').Locator;
    inc: () => import('@playwright/test').Locator;
    dec: () => import('@playwright/test').Locator;
    val: () => import('@playwright/test').Locator;
    addBtn: () => import('@playwright/test').Locator;
}

function listCtx(page: Page): StepperCtx {
    const stepper = (): import('@playwright/test').Locator => page.locator(LIST_STEPPER);
    return {
        add: () => page.locator(LIST_ROW).getByRole('button', { name: LIST_ADD }).click(),
        stepper,
        inc: () => stepper().locator(STEPPER_INC),
        dec: () => stepper().locator(STEPPER_DEC),
        val: () => stepper().locator(STEPPER_VAL),
        addBtn: () => page.locator(LIST_ROW).getByRole('button', { name: LIST_ADD }),
    };
}

function gridCtx(page: Page): StepperCtx {
    const stepper = (): import('@playwright/test').Locator =>
        page.locator(CARD).locator(CARD_STEPPER);
    return {
        add: () => page.locator(CARD).locator(CARD_ADD).click(),
        stepper,
        inc: () => stepper().locator(STEPPER_INC),
        dec: () => stepper().locator(STEPPER_DEC),
        val: () => stepper().locator(STEPPER_VAL),
        addBtn: () => page.locator(CARD).locator(CARD_ADD),
    };
}

// ---------- shared scenario runner ----------

function stepperScenarios(
    label: string,
    setup: (page: Page) => Promise<void>,
    ctx: (page: Page) => StepperCtx,
): void {
    test.describe(`Stepper — ${label}`, () => {
        test.beforeEach(async ({ page }) => {
            await clearCart(page);
            await setup(page);
        });

        test('Add button visible before adding, stepper hidden', async ({ page }) => {
            const c = ctx(page);
            await expect(c.addBtn()).toBeVisible();
            await expect(c.stepper()).not.toBeVisible();
        });

        test('Add replaces button with stepper at qty 1', async ({ page }) => {
            const c = ctx(page);
            await c.add();
            await expect(c.stepper()).toBeVisible({ timeout: 5000 });
            await expect(c.val()).toHaveText('1');
            await expect(c.addBtn()).not.toBeVisible();
        });

        test('+ increments qty: 1 → 2 → 3', async ({ page }) => {
            const c = ctx(page);
            await c.add();
            await expect(c.stepper()).toBeVisible({ timeout: 5000 });

            await c.inc().click();
            await expect(c.val()).toHaveText('2');

            await c.inc().click();
            await expect(c.val()).toHaveText('3');
        });

        test('− decrements qty: 3 → 2 → 1', async ({ page }) => {
            const c = ctx(page);
            await c.add();
            await expect(c.stepper()).toBeVisible({ timeout: 5000 });

            await c.inc().click();
            await expect(c.val()).toHaveText('2');
            await c.inc().click();
            await expect(c.val()).toHaveText('3');

            await c.dec().click();
            await expect(c.val()).toHaveText('2');
            await c.dec().click();
            await expect(c.val()).toHaveText('1');
        });

        test('− at qty 1 removes item; Add button restored; badge 0', async ({ page }) => {
            const c = ctx(page);
            await c.add();
            await expect(c.stepper()).toBeVisible({ timeout: 5000 });
            await expect(page.locator(BADGE)).toHaveText('1');

            await c.dec().click();

            await expect(c.addBtn()).toBeVisible({ timeout: 5000 });
            await expect(c.stepper()).not.toBeVisible();
            await expect(page.locator(BADGE)).toHaveText('0');
        });

        test('− at qty 2 → 1: item stays, Add button stays hidden', async ({ page }) => {
            const c = ctx(page);
            await c.add();
            await expect(c.stepper()).toBeVisible({ timeout: 5000 });

            await c.inc().click();
            await expect(c.val()).toHaveText('2');

            await c.dec().click();
            await expect(c.val()).toHaveText('1');
            await expect(c.stepper()).toBeVisible();
            await expect(c.addBtn()).not.toBeVisible();
        });

        test('badge tracks position count, not unit count', async ({ page }) => {
            const c = ctx(page);
            await c.add();
            await expect(c.stepper()).toBeVisible({ timeout: 5000 });
            await expect(page.locator(BADGE)).toHaveText('1');

            await c.inc().click();
            await expect(c.val()).toHaveText('2');
            await c.inc().click();
            await expect(c.val()).toHaveText('3');

            // 3 units of 1 product = still 1 position
            await expect(page.locator(BADGE)).toHaveText('1');
        });
    });
}

stepperScenarios('list view', openCatalogList, listCtx);
stepperScenarios('grid view', openCatalogGrid, gridCtx);
