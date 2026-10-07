import { test, expect } from './fixture';
import {
    addSku,
    DISCOUNTED_SKUS,
    PLAIN_SKUS,
    expectConsistent,
    expectUiMatchesApi,
    settledCart,
    cartUi,
} from './cart-helpers';

test.describe('Cart totals @cart-totals', () => {
    test('plain cart: totals equal the sum of lines and UI shows no discount', async ({ page }) => {
        await addSku(page, PLAIN_SKUS[0], 3);
        await addSku(page, PLAIN_SKUS[1], 2);
        const cart = await settledCart(page);
        expect(cart.lines).toHaveLength(2);
        expect(
            cart.lines.every(l => l.compareAtPrice == null || l.compareAtPrice <= l.unitPrice),
        ).toBe(true);
        expectConsistent(cart);
        await expectUiMatchesApi(page, cart);
    });

    test('discounted cart: struck-through old prices, discount line and totals agree', async ({
        page,
    }) => {
        await addSku(page, DISCOUNTED_SKUS[0], 1);
        await addSku(page, DISCOUNTED_SKUS[1], 2);
        const cart = await settledCart(page);
        expect(
            cart.lines.every(l => l.compareAtPrice != null && l.compareAtPrice > l.unitPrice),
        ).toBe(true);
        expectConsistent(cart);
        await expectUiMatchesApi(page, cart);
        const ui = await cartUi(page);
        expect(ui.struckUnits).toBe(cart.lines.length);
        expect(ui.struckTotals).toBe(cart.lines.length);
        expect(ui.discount).not.toBeNull();
    });

    test('mixed cart: only discounted lines are struck through', async ({ page }) => {
        await addSku(page, DISCOUNTED_SKUS[0], 1);
        await addSku(page, PLAIN_SKUS[0], 2);
        const cart = await settledCart(page);
        const discounted = cart.lines.filter(
            l => l.compareAtPrice != null && l.compareAtPrice > l.unitPrice,
        );
        expect(discounted).toHaveLength(1);
        expect(cart.lines).toHaveLength(2);
        expectConsistent(cart);
        await expectUiMatchesApi(page, cart);
        const ui = await cartUi(page);
        expect(ui.struckUnits).toBe(1);
        expect(ui.struckTotals).toBe(1);
    });

    test('price columns: unit price x quantity equals line total on every line', async ({
        page,
    }) => {
        await addSku(page, DISCOUNTED_SKUS[0], 3);
        await addSku(page, PLAIN_SKUS[0], 4);
        const cart = await settledCart(page);
        for (const line of cart.lines) {
            expect(
                Math.abs(line.unitPrice * line.quantity - line.linePriceWithTax),
                `API ${line.productVariant.sku}`,
            ).toBeLessThanOrEqual(line.quantity);
        }
        const ui = await cartUi(page);
        const qtys = await page
            .locator('.cart-item .mv-qty-stepper__val')
            .evaluateAll(els =>
                els.map(el => (el as HTMLInputElement).value || el.textContent || ''),
            );
        ui.unitPrices.forEach((unit, i) => {
            expect(Math.abs(unit * Number(qtys[i]) - ui.lineTotals[i])).toBeLessThanOrEqual(
                0.5 + 0.005 * Number(qtys[i]),
            );
        });
    });
});
