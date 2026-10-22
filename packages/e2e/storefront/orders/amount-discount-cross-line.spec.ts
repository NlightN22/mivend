import { test, expect } from '@playwright/test';
import { clearCart, gql } from './helpers';

interface OrderLine {
    id: string;
    quantity: number;
    discountedUnitPriceWithTax: number;
    productVariant: { sku: string };
}

async function findVariantId(page: import('@playwright/test').Page, sku: string): Promise<string> {
    const result = await gql(
        page,
        `query { search(input: { take: 100 }) { items { sku productVariantId } } }`,
    );
    const items = (result.search as { items: { sku: string; productVariantId: string }[] }).items;
    const item = items.find(i => i.sku === sku);
    if (!item) throw new Error(`Variant not found for sku=${sku}`);
    return item.productVariantId;
}

function lineFor(lines: OrderLine[], sku: string): OrderLine {
    const line = lines.find(l => l.productVariant.sku === sku);
    if (!line) throw new Error(`Order line not found for sku=${sku}`);
    return line;
}

// Same coverage as volume-discount-cross-line.spec.ts, but for the spend-amount metric
// ('e2e-amount-brand') instead of weight.
test.describe('Spend-amount-tiered discount — cross-line repricing', () => {
    test('crossing the spend threshold on one line also reprices a different pre-existing line of the same brand', async ({
        page,
    }) => {
        await clearCart(page);
        const brk1 = await findVariantId(page, 'E2E-BRK-001'); // 1080₽
        const brk2 = await findVariantId(page, 'E2E-BRK-002'); // 720₽

        // brk1 alone (1080₽) is under the 2000₽ brand amount tier, so that rule is off here.
        // The facet-less account-wide 8% grant still applies, so expect the discounted price.
        const add1 = await gql(
            page,
            `mutation($id: ID!) {
                addItemToOrder(productVariantId: $id, quantity: 1) {
                    __typename
                    ... on Order { lines { id quantity discountedUnitPriceWithTax productVariant { sku } } }
                }
            }`,
            { id: brk1 },
        );
        expect(
            lineFor((add1.addItemToOrder as { lines: OrderLine[] }).lines, 'E2E-BRK-001')
                .discountedUnitPriceWithTax,
        ).toBe(Math.round(108000 * 0.92));

        // Add brk2 at qty 1: aggregate spend 1080 + 720 = 1800₽ — still under 2000₽, same 8%
        // account-wide grant applies to both lines.
        const add2 = await gql(
            page,
            `mutation($id: ID!) {
                addItemToOrder(productVariantId: $id, quantity: 1) {
                    __typename
                    ... on Order { lines { id quantity discountedUnitPriceWithTax productVariant { sku } } }
                }
            }`,
            { id: brk2 },
        );
        let lines = (add2.addItemToOrder as { lines: OrderLine[] }).lines;
        expect(lineFor(lines, 'E2E-BRK-002').discountedUnitPriceWithTax).toBe(
            Math.round(72000 * 0.92),
        );
        expect(lineFor(lines, 'E2E-BRK-001').discountedUnitPriceWithTax).toBe(
            Math.round(108000 * 0.92),
        );

        // Bump brk2 to qty 2: aggregate spend 1080 + 720*2 = 2520₽ — crosses the 2000₽
        // tier (30%). brk1 — untouched by this mutation — must also drop to the tier.
        const brk2LineId = lineFor(lines, 'E2E-BRK-002').id;
        const adjust = await gql(
            page,
            `mutation($lineId: ID!) {
                adjustOrderLine(orderLineId: $lineId, quantity: 2) {
                    __typename
                    ... on Order { lines { id quantity discountedUnitPriceWithTax productVariant { sku } } }
                }
            }`,
            { lineId: brk2LineId },
        );
        lines = (adjust.adjustOrderLine as { lines: OrderLine[] }).lines;

        const brk2Line = lineFor(lines, 'E2E-BRK-002');
        expect(brk2Line.quantity).toBe(2);
        expect(brk2Line.discountedUnitPriceWithTax).toBe(Math.round(72000 * 0.7));

        // Untouched by this mutation, yet already on the new tier in the same response.
        expect(lineFor(lines, 'E2E-BRK-001').discountedUnitPriceWithTax).toBe(
            Math.round(108000 * 0.7),
        );
    });
});
