import { expect, type Page } from '@playwright/test';
import { adminGql } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import { SUPERADMIN } from '../../fixtures/accounts';
import { gql } from '../orders/helpers';
import { parseRub } from './cart-helpers';

export interface TaxedLine {
    quantity: number;
    unitPrice: number;
    unitPriceWithTax: number;
    linePriceWithTax: number;
    compareAtPrice: number | null;
    taxRate: number;
    productVariant: { sku: string };
}

export async function fetchTaxedLines(page: Page): Promise<TaxedLine[]> {
    const data = await gql(
        page,
        `query { activeOrder { lines { quantity unitPrice unitPriceWithTax linePriceWithTax
            compareAtPrice taxRate productVariant { sku } } } }`,
    );
    return (data.activeOrder as { lines: TaxedLine[] } | null)?.lines ?? [];
}

export interface DefaultTaxRate {
    id: string;
    value: number;
}

async function superadminToken(): Promise<string> {
    return adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);
}

export async function defaultTaxRate(): Promise<DefaultTaxRate> {
    const { data } = await adminGql<{
        activeChannel: { defaultTaxZone: { id: string } | null };
        taxRates: {
            items: { id: string; value: number; enabled: boolean; zone: { id: string } }[];
        };
    }>(
        `query { activeChannel { defaultTaxZone { id } }
            taxRates(options: { take: 100 }) { items { id value enabled zone { id } } } }`,
        undefined,
        await superadminToken(),
    );
    const zoneId = data.activeChannel.defaultTaxZone?.id;
    const rates = data.taxRates.items.filter(r => r.enabled && r.zone.id === zoneId);
    if (rates.length !== 1)
        throw new Error(`Expected one enabled default-zone tax rate, got ${rates.length}`);
    return { id: rates[0].id, value: rates[0].value };
}

// Vendure's updateTaxRate refreshes the server's active-rate cache synchronously.
export async function setTaxRate(id: string, value: number): Promise<void> {
    await adminGql(
        `mutation($id: ID!, $value: Float!) { updateTaxRate(input: { id: $id, value: $value }) { id } }`,
        { id, value },
        await superadminToken(),
    );
}

const rub = (kopecks: number): number => kopecks / 100;

function expectedPercent(line: TaxedLine): number {
    return Math.round((1 - line.unitPriceWithTax / line.compareAtPrice!) * 100);
}

export function expectGrossApi(lines: TaxedLine[], rate: number): void {
    for (const line of lines) {
        const label = line.productVariant.sku;
        expect(line.taxRate, `${label}: line tax rate`).toBe(rate);
        expect(
            Math.abs(line.unitPrice * (1 + rate / 100) - line.unitPriceWithTax),
            `${label}: unitPriceWithTax = unitPrice x (1 + rate)`,
        ).toBeLessThanOrEqual(1);
        expect(
            line.compareAtPrice,
            `${label}: discounted line has a gross list price`,
        ).not.toBeNull();
        expect(line.compareAtPrice!).toBeGreaterThan(line.unitPriceWithTax);
    }
}

export async function expectGrossUi(page: Page, lines: TaxedLine[]): Promise<void> {
    await page.goto('/cart');
    await expect(page.locator('.cart-item').first()).toBeVisible({ timeout: 10000 });
    let expectedDiscount = 0;
    for (const line of lines) {
        const label = line.productVariant.sku;
        const row = page.locator('.cart-item', { hasText: label });
        const unit = row.locator('.cart-item__unit');
        const total = row.locator('.cart-item__total');
        const amount = async (loc: ReturnType<Page['locator']>): Promise<number> =>
            parseRub(await loc.first().textContent());
        const listTotal = line.compareAtPrice! * line.quantity;
        expect(await amount(unit.locator('.line-price__unit')), `${label}: unit price`).toBeCloseTo(
            rub(line.unitPriceWithTax),
            1,
        );
        expect(
            await amount(unit.locator('.line-price__old')),
            `${label}: struck list price`,
        ).toBeCloseTo(rub(line.compareAtPrice!), 1);
        expect(
            Math.abs(
                (await amount(total.locator('.line-price__total'))) - rub(line.linePriceWithTax),
            ),
            `${label}: line total`,
        ).toBeLessThanOrEqual(0.5);
        expect(
            Math.abs((await amount(total.locator('.line-price__old'))) - rub(listTotal)),
            `${label}: struck list total`,
        ).toBeLessThanOrEqual(1);
        await unit.locator('.cart-item__price-trigger').click();
        const tooltip = page.locator('.mv-tooltip__popper:visible .mv-tooltip__content');
        await expect(tooltip, `${label}: discount percent`).toContainText(
            `−${expectedPercent(line)}%`,
        );
        await page.locator('.cart-summary').click({ position: { x: 1, y: 1 } });
        await expect(tooltip).toBeHidden();
        expectedDiscount += listTotal - line.linePriceWithTax;
    }
    const summary = page.locator('.cart-summary');
    const discount = Math.abs(
        parseRub(
            await summary
                .locator('.cart-summary__line', { hasText: 'Customer discount' })
                .locator('strong')
                .textContent(),
        ),
    );
    expect(Math.abs(discount - rub(expectedDiscount)), 'discount sum').toBeLessThanOrEqual(
        lines.length,
    );
    const total = parseRub(await summary.locator('.cart-summary__total strong').textContent());
    const sum = lines.reduce((s, l) => s + l.linePriceWithTax, 0);
    expect(total, 'cart total').toBeCloseTo(rub(sum), 2);
}
