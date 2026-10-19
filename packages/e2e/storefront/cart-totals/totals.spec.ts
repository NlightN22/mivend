import { test, expect } from './fixture';
import {
    addSku,
    DISCOUNTED_SKUS,
    GRANT_ONLY_SKUS,
    ACCOUNT_GRANT_PERCENT,
    discountPercent,
    expectConsistent,
    expectUiMatchesApi,
    settledCart,
    cartUi,
} from './cart-helpers';

test.describe('Cart totals @cart-totals', () => {
    test('grant-only cart: every line carries just the account-wide grant and totals agree', async ({
        page,
    }) => {
        await addSku(page, GRANT_ONLY_SKUS[0], 3);
        await addSku(page, GRANT_ONLY_SKUS[1], 2);
        const cart = await settledCart(page);
        expect(cart.lines).toHaveLength(2);
        expect(cart.lines.map(discountPercent)).toEqual([
            ACCOUNT_GRANT_PERCENT,
            ACCOUNT_GRANT_PERCENT,
        ]);
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

    test('mixed cart: a brand-discounted line beats the account-wide grant on its neighbour', async ({
        page,
    }) => {
        await addSku(page, DISCOUNTED_SKUS[0], 1);
        await addSku(page, GRANT_ONLY_SKUS[0], 2);
        const cart = await settledCart(page);
        expect(cart.lines).toHaveLength(2);
        const bySku = new Map(cart.lines.map(l => [l.productVariant.sku, discountPercent(l)]));
        expect(bySku.get(GRANT_ONLY_SKUS[0])).toBe(ACCOUNT_GRANT_PERCENT);
        expect(bySku.get(DISCOUNTED_SKUS[0])).toBeGreaterThan(ACCOUNT_GRANT_PERCENT);
        expectConsistent(cart);
        await expectUiMatchesApi(page, cart);
        const ui = await cartUi(page);
        expect(ui.struckUnits).toBe(2);
        expect(ui.struckTotals).toBe(2);
    });

    test('price columns: unit price x quantity equals line total on every line', async ({
        page,
    }) => {
        await addSku(page, DISCOUNTED_SKUS[0], 3);
        await addSku(page, GRANT_ONLY_SKUS[0], 4);
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
