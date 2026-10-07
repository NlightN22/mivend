import { expect, type Page } from '@playwright/test';
import { clearCart, gql } from '../orders/helpers';

export { clearCart };

export const DISCOUNTED_SKUS = ['E2E-OIL-001', 'E2E-OIL-002'];
export const PLAIN_SKUS = ['E2E-FLT-001', 'E2E-AIR-001'];

export interface CartLine {
    id: string;
    quantity: number;
    unitPrice: number;
    linePriceWithTax: number;
    compareAtPrice: number | null;
    productVariant: { sku: string };
}

export interface Cart {
    totalWithTax: number;
    subTotalWithTax: number;
    lines: CartLine[];
}

const ORDER_FIELDS = `totalWithTax subTotalWithTax
    lines { id quantity unitPrice linePriceWithTax compareAtPrice productVariant { sku } }`;

export async function fetchCart(page: Page): Promise<Cart> {
    const data = await gql(page, `query { activeOrder { ${ORDER_FIELDS} } }`);
    return (data.activeOrder as Cart | null) ?? { totalWithTax: 0, subTotalWithTax: 0, lines: [] };
}

const variantIds = new Map<string, string>();

export async function variantIdBySku(page: Page, sku: string): Promise<string> {
    const cached = variantIds.get(sku);
    if (cached) return cached;
    const data = await gql(
        page,
        `query($term: String!) { search(input: { term: $term, take: 5 }) { items { sku productVariantId } } }`,
        { term: sku },
    );
    const items = (data.search as { items: { sku: string; productVariantId: string }[] }).items;
    const item = items.find(i => i.sku === sku);
    if (!item) throw new Error(`Variant not found for sku=${sku}`);
    variantIds.set(sku, item.productVariantId);
    return item.productVariantId;
}

export async function addSku(page: Page, sku: string, quantity: number): Promise<void> {
    const id = await variantIdBySku(page, sku);
    const data = await gql(
        page,
        `mutation($id: ID!, $q: Int!) { addItemToOrder(productVariantId: $id, quantity: $q) { __typename ... on ErrorResult { message } } }`,
        { id, q: quantity },
    );
    const result = data.addItemToOrder as { __typename: string; message?: string };
    if (result.__typename !== 'Order') throw new Error(`addItemToOrder ${sku}: ${result.message}`);
}

export async function settledCart(page: Page): Promise<Cart> {
    let previous = '';
    let cart = await fetchCart(page);
    for (let attempt = 0; attempt < 10; attempt++) {
        const snapshot = JSON.stringify(cart);
        if (snapshot === previous) return cart;
        previous = snapshot;
        await page.waitForTimeout(300);
        cart = await fetchCart(page);
    }
    throw new Error('Cart did not settle within the polling bound');
}

export function sumLines(cart: Cart): number {
    return cart.lines.reduce((sum, l) => sum + l.linePriceWithTax, 0);
}

export function expectedDiscount(cart: Cart): number {
    return cart.lines.reduce((sum, l) => {
        if (l.compareAtPrice == null || l.compareAtPrice <= l.unitPrice) return sum;
        const ratio = (l.compareAtPrice - l.unitPrice) / l.unitPrice;
        return sum + Math.round(l.linePriceWithTax * ratio);
    }, 0);
}

export function expectConsistent(cart: Cart): void {
    expect(cart.totalWithTax, 'order total must equal the sum of line prices').toBe(sumLines(cart));
    expect(cart.subTotalWithTax, 'subtotal must equal the sum of line prices').toBe(sumLines(cart));
}

export function parseRub(text: string | null): number {
    const cleaned = (text ?? '')
        .replace(/[^\d,.\-−]/g, '')
        .replace('−', '-')
        .replace(',', '.');
    const value = Number(cleaned);
    if (Number.isNaN(value)) throw new Error(`Cannot parse amount from "${text}"`);
    return value;
}

export async function cartUi(page: Page): Promise<{
    badge: number;
    total: number;
    subtotal: number | null;
    discount: number | null;
    lineTotals: number[];
    unitPrices: number[];
    struckUnits: number;
    struckTotals: number;
}> {
    await page.goto('/cart');
    await expect(page.locator('.cart-item').first()).toBeVisible({ timeout: 10000 });
    const summary = page.locator('.cart-summary');
    const optional = async (text: string): Promise<number | null> => {
        const row = summary.locator('.cart-summary__line', { hasText: text }).locator('strong');
        return (await row.count()) ? Math.abs(parseRub(await row.first().textContent())) : null;
    };
    const texts = async (selector: string): Promise<string[]> =>
        page.locator(selector).allTextContents();
    return {
        badge: Number(await page.locator('.app-header__cart-badge').first().textContent()),
        total: parseRub(await summary.locator('.cart-summary__total strong').textContent()),
        subtotal: await optional('Subtotal'),
        discount: await optional('Customer discount'),
        lineTotals: (await texts('.cart-item__total .line-price__total')).map(parseRub),
        unitPrices: (await texts('.cart-item__unit .line-price__unit')).map(parseRub),
        struckUnits: await page.locator('.cart-item__unit .line-price__old').count(),
        struckTotals: await page.locator('.cart-item__total .line-price__old').count(),
    };
}

export async function checkoutUi(page: Page): Promise<{ total: number; discount: number | null }> {
    await page.goto('/checkout');
    const total = page.locator('.checkout-summary__total strong');
    await expect(total).toBeVisible({ timeout: 10000 });
    await expect
        .poll(async () => parseRub(await total.textContent()), { timeout: 10000 })
        .toBeGreaterThan(0);
    const discount = page.locator('.checkout-summary__discount');
    return {
        total: parseRub(await total.textContent()),
        discount: (await discount.count())
            ? Math.abs(parseRub(await discount.textContent()))
            : null,
    };
}

export async function expectUiMatchesApi(page: Page, cart: Cart): Promise<void> {
    const ui = await cartUi(page);
    const rub = (kopecks: number): number => kopecks / 100;
    expect(ui.badge, 'header badge counts lines').toBe(cart.lines.length);
    expect(ui.total, 'cart summary total').toBeCloseTo(rub(cart.totalWithTax), 2);
    const apiTotals = cart.lines.map(l => rub(l.linePriceWithTax)).sort((a, b) => a - b);
    const uiTotals = [...ui.lineTotals].sort((a, b) => a - b);
    apiTotals.forEach((expected, i) =>
        expect(Math.abs(uiTotals[i] - expected)).toBeLessThanOrEqual(0.5 + 1e-9),
    );
    expect(uiTotals).toHaveLength(apiTotals.length);
    const discount = expectedDiscount(cart);
    if (discount > 0) {
        expect(ui.discount, 'customer discount line').toBeCloseTo(rub(discount), 0);
        expect(ui.subtotal! - ui.discount!, 'subtotal minus discount').toBeCloseTo(ui.total, 0);
    } else {
        expect(ui.discount).toBeNull();
    }
    const checkout = await checkoutUi(page);
    expect(checkout.total, 'checkout total equals cart total').toBeCloseTo(ui.total, 2);
    expect(checkout.discount).toEqual(ui.discount);
}
