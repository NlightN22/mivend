import {
    test,
    expect,
    type Browser,
    type BrowserContext,
    type Locator,
    type Page,
} from '@playwright/test';
import {
    MARKUP_CUSTOMER,
    MARKUP_DISCOUNT_PERCENT,
    MARKUP_DISCOUNT_QUANTITY,
    MARKUP_PERCENT,
    MARKUP_PRODUCT_A,
    MARKUP_PRODUCT_B,
} from '../../fixtures/seed-markup';
import { E2E_BROWSER_USER_AGENT } from '../../helpers/user-agent';
import { loginAs } from '../../helpers/storefront-auth';
import { addSku, cartUi, clearCart, fetchCart, parseRub } from '../cart-totals/cart-helpers';
import { finishOrdersTouchedSince } from '../order-cleanup';
import { gql } from '../orders/helpers';

// Prices in kopecks, rounded like price-entry rounds a unit price.
const kopecks = (rubles: number): number => rubles * 100;
const markedUp = (rubles: number): number =>
    Math.round(kopecks(rubles) * (1 - MARKUP_PERCENT / 100));
const discounted = (rubles: number): number =>
    Math.round(kopecks(rubles) * (1 - MARKUP_DISCOUNT_PERCENT / 100));
const A_UNIT = markedUp(MARKUP_PRODUCT_A.price);
const B_UNIT = markedUp(MARKUP_PRODUCT_B.price);
const NO_MARKUP_WORDING = /markup|surcharge|extra charge/i;

let context: BrowserContext;
let page: Page;
let since: Date;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
    context = await browser.newContext({
        baseURL: process.env.STOREFRONT_URL ?? 'http://localhost:5173',
        storageState: undefined,
        userAgent: E2E_BROWSER_USER_AGENT,
    });
    page = await context.newPage();
    await loginAs(page, MARKUP_CUSTOMER.email, MARKUP_CUSTOMER.password);
});

test.afterAll(async () => {
    await context.close();
});

test.beforeEach(async () => {
    since = new Date();
    await clearCart(page);
});

test.afterEach(async () => {
    await finishOrdersTouchedSince(page, since);
    await clearCart(page);
});

const cardFor = (sku: string): Locator =>
    page.locator('.mv-product-card').filter({
        has: page.locator('.mv-product-card__sku', { hasText: new RegExp(`^${sku}$`) }),
    });

async function expectNoDiscountIndication(scope: Locator): Promise<void> {
    await expect(
        scope.locator('[class*="strike"], [class*="old-price"], [class*="compare"]'),
    ).toHaveCount(0);
    await expect(scope.locator('[class*="discount-badge"], [class*="tier-progress"]')).toHaveCount(
        0,
    );
    await expect(scope).not.toContainText(NO_MARKUP_WORDING);
    await expect(scope).not.toContainText('%');
}

test.describe('Markup rule (negative discount percent) is shown only as the final price @markup', () => {
    test('catalog card and product page show the base price plus the markup, no discount or markup indication', async () => {
        await page.goto('/catalog');
        await page.getByRole('button', { name: 'Grid' }).click();
        const search = page.getByPlaceholder('Article, VIN, brand, name or OEM');
        await search.fill(MARKUP_PRODUCT_A.sku);
        await search.press('Enter');

        const card = cardFor(MARKUP_PRODUCT_A.sku);
        await expect(card).toBeVisible({ timeout: 10000 });
        await expect
            .poll(async () =>
                parseRub(await card.locator('.mv-product-card__customer-price').textContent()),
            )
            .toBe(A_UNIT / 100);
        await expectNoDiscountIndication(card);

        await card.locator('.mv-product-card__name').click();
        const panel = page.locator('.buy-panel__card');
        await expect(panel.locator('.buy-panel__price')).toBeVisible({ timeout: 10000 });
        expect(parseRub(await panel.locator('.buy-panel__price').textContent())).toBe(A_UNIT / 100);
        await expect(panel.locator('.buy-panel__tier-progress')).toHaveCount(0);
        await expect(panel).not.toContainText(NO_MARKUP_WORDING);
        await expect(panel.locator('.buy-panel__compare-at-price')).toHaveCount(0);
    });

    test('cart line price and total carry the markup and the cart shows no saving or discount line', async () => {
        await addSku(page, MARKUP_PRODUCT_A.sku, 2);
        const cart = await fetchCart(page);
        expect(cart.lines).toHaveLength(1);
        expect(cart.lines[0].discountedUnitPriceWithTax).toBe(A_UNIT);
        expect(cart.lines[0].discountedLinePriceWithTax).toBe(2 * A_UNIT);
        expect(cart.lines[0].compareAtPrice).toBeNull();
        expect(cart.totalWithTax).toBe(2 * A_UNIT);

        const ui = await cartUi(page);
        expect(ui.unitPrices).toEqual([A_UNIT / 100]);
        expect(ui.lineTotals).toEqual([(2 * A_UNIT) / 100]);
        expect(ui.total).toBe((2 * A_UNIT) / 100);
        expect(ui.discount).toBeNull();
        expect(ui.subtotal).toBeNull();
        expect(ui.struckUnits).toBe(0);
        expect(ui.struckTotals).toBe(0);
        await expect(page.locator('.cart-summary__line--discount')).toHaveCount(0);
        await expect(page.locator('.cart-item')).not.toContainText(NO_MARKUP_WORDING);
    });

    test('a placed order carries the markup in its line and total and the order page shows no discount', async () => {
        await addSku(page, MARKUP_PRODUCT_A.sku, 2);
        await page.goto('/checkout');
        await page.getByRole('button', { name: /^Cash/i }).click();
        await page.getByRole('button', { name: 'Place order' }).click();
        await expect(page).toHaveURL(/\/order-created\?code=/, { timeout: 15000 });
        const code = new URL(page.url()).searchParams.get('code');

        const data = (await gql(
            page,
            `query($c: String!) { orderByCode(code: $c) { id totalWithTax lines { quantity discountedUnitPriceWithTax discountedLinePriceWithTax } } }`,
            { c: code },
        )) as {
            orderByCode: {
                id: string;
                totalWithTax: number;
                lines: {
                    quantity: number;
                    discountedUnitPriceWithTax: number;
                    discountedLinePriceWithTax: number;
                }[];
            };
        };
        const order = data.orderByCode;
        expect(order.lines).toHaveLength(1);
        expect(order.lines[0].discountedUnitPriceWithTax).toBe(A_UNIT);
        expect(order.lines[0].discountedLinePriceWithTax).toBe(2 * A_UNIT);
        expect(order.totalWithTax).toBe(2 * A_UNIT);

        await page.goto(`/orders/${order.id}`);
        const row = page.locator('.olt-table tbody tr').first();
        await expect(row).toBeVisible({ timeout: 10000 });
        const prices = await row.locator('.olt-num').allTextContents();
        expect(prices.map(parseRub).slice(-2)).toEqual([A_UNIT / 100, (2 * A_UNIT) / 100]);
        expect(parseRub(await page.locator('.otc-total').textContent())).toBe((2 * A_UNIT) / 100);
        await expect(page.locator('.otc')).not.toContainText(/discount|saving|markup/i);
        await expect(page.locator('.olt-table')).not.toContainText(/discount|saving|markup/i);
    });

    test('a better positive rule wins over the markup once its quantity is reached', async () => {
        await addSku(page, MARKUP_PRODUCT_B.sku, 1);
        let line = (await fetchCart(page)).lines[0];
        expect(line.discountedUnitPriceWithTax).toBe(B_UNIT);
        expect(line.compareAtPrice).toBeNull();

        await addSku(page, MARKUP_PRODUCT_B.sku, MARKUP_DISCOUNT_QUANTITY - 1);
        const cart = await fetchCart(page);
        line = cart.lines[0];
        expect(line.quantity).toBe(MARKUP_DISCOUNT_QUANTITY);
        expect(line.discountedUnitPriceWithTax).toBe(discounted(MARKUP_PRODUCT_B.price));
        expect(line.compareAtPrice).toBe(kopecks(MARKUP_PRODUCT_B.price));
        expect(cart.totalWithTax).toBe(
            MARKUP_DISCOUNT_QUANTITY * discounted(MARKUP_PRODUCT_B.price),
        );
    });
});
