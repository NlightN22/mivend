import { test, expect } from './fixture';
import {
    addSku,
    DISCOUNTED_SKUS,
    PLAIN_SKUS,
    clearCart,
    expectConsistent,
    expectUiMatchesApi,
    fetchCart,
    settledCart,
} from './cart-helpers';
import { loginAs } from '../../helpers/storefront-auth';
import { E2E_CUSTOMER } from '../../fixtures/seed';

const ATTEMPTS = 5;

async function waitForQuantity(
    page: import('@playwright/test').Page,
    total: number,
): Promise<void> {
    await expect
        .poll(async () => (await fetchCart(page)).lines.reduce((s, l) => s + l.quantity, 0), {
            timeout: 10000,
        })
        .toBe(total);
}

test.describe('Cart behaviour @cart-totals', () => {
    test.setTimeout(90000);

    test('stepper increase, decrease and remove keep the invariants', async ({ page }) => {
        await addSku(page, DISCOUNTED_SKUS[0], 1);
        await addSku(page, PLAIN_SKUS[0], 1);
        await page.goto('/cart');
        const rows = page.locator('.cart-item');
        await expect(rows).toHaveCount(2);
        const inc = rows.first().locator('.mv-qty-stepper__btn:last-child');
        const dec = rows.first().locator('.mv-qty-stepper__btn:first-child');

        await inc.click();
        await inc.click();
        await waitForQuantity(page, 4);
        expectConsistent(await settledCart(page));

        await dec.click();
        await waitForQuantity(page, 3);
        const afterDecrease = await settledCart(page);
        expectConsistent(afterDecrease);
        await expectUiMatchesApi(page, afterDecrease);

        await page.goto('/cart');
        await page
            .locator('.cart-item')
            .first()
            .locator('.mv-qty-stepper__btn:first-child')
            .click();
        await page
            .locator('.cart-item')
            .first()
            .locator('.mv-qty-stepper__btn:first-child')
            .click();
        await page.locator('.cart-item__remove-confirm-yes').click();
        await expect.poll(async () => (await fetchCart(page)).lines.length).toBe(1);
        const afterRemove = await settledCart(page);
        expectConsistent(afterRemove);
        await expectUiMatchesApi(page, afterRemove);
    });

    test(`identical carts built ${ATTEMPTS} times produce identical totals`, async ({ page }) => {
        const totals: { total: number; lines: number[] }[] = [];
        for (let i = 0; i < ATTEMPTS; i++) {
            await clearCart(page);
            await addSku(page, DISCOUNTED_SKUS[0], 2);
            await addSku(page, DISCOUNTED_SKUS[1], 3);
            await addSku(page, PLAIN_SKUS[0], 1);
            const cart = await settledCart(page);
            expectConsistent(cart);
            totals.push({
                total: cart.totalWithTax,
                lines: cart.lines.map(l => l.linePriceWithTax).sort((a, b) => a - b),
            });
        }
        for (const t of totals) expect(t).toEqual(totals[0]);
    });

    test('cart shows the same numbers after reload and after re-login', async ({ page }) => {
        await addSku(page, DISCOUNTED_SKUS[0], 2);
        await addSku(page, PLAIN_SKUS[1], 2);
        const before = await settledCart(page);
        await expectUiMatchesApi(page, before);

        await page.reload();
        await expectUiMatchesApi(page, await settledCart(page));

        await page.context().clearCookies();
        await loginAs(page, E2E_CUSTOMER.email, E2E_CUSTOMER.password);
        const after = await settledCart(page);
        expect(after.totalWithTax).toBe(before.totalWithTax);
        expect(after.lines.map(l => l.linePriceWithTax).sort()).toEqual(
            before.lines.map(l => l.linePriceWithTax).sort(),
        );
        await expectUiMatchesApi(page, after);
    });
});
