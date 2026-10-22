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

// Vendure only reprices the mutated OrderLine's list price; the order-dependent discount is a promotion
// evaluated for every line in the same transaction, so a sibling moves tier in the mutation's own response.
test.describe('Volume-tiered discount — cross-line repricing', () => {
    test('crossing the tier threshold on one line also reprices a different pre-existing line of the same brand', async ({
        page,
    }) => {
        await clearCart(page);
        const oil1 = await findVariantId(page, 'E2E-OIL-001'); // weight 100kg, 765₽
        const oil2 = await findVariantId(page, 'E2E-OIL-002'); // weight 50kg, 495₽

        // oil1 alone: 100kg < 200kg tier — only the flat 10% facet discount applies.
        const add1 = await gql(
            page,
            `mutation($id: ID!) {
                addItemToOrder(productVariantId: $id, quantity: 1) {
                    __typename
                    ... on Order { lines { id quantity discountedUnitPriceWithTax productVariant { sku } } }
                }
            }`,
            { id: oil1 },
        );
        const oil1LineAfterAdd1 = lineFor(
            (add1.addItemToOrder as { lines: OrderLine[] }).lines,
            'E2E-OIL-001',
        );
        expect(oil1LineAfterAdd1.discountedUnitPriceWithTax).toBe(Math.round(76500 * 0.9));

        // Add oil2 at qty 1: aggregate weight 100 + 50 = 150kg — still under 200kg.
        const add2 = await gql(
            page,
            `mutation($id: ID!) {
                addItemToOrder(productVariantId: $id, quantity: 1) {
                    __typename
                    ... on Order { lines { id quantity discountedUnitPriceWithTax productVariant { sku } } }
                }
            }`,
            { id: oil2 },
        );
        let lines = (add2.addItemToOrder as { lines: OrderLine[] }).lines;
        expect(lineFor(lines, 'E2E-OIL-002').discountedUnitPriceWithTax).toBe(
            Math.round(49500 * 0.9),
        );
        expect(lineFor(lines, 'E2E-OIL-001').discountedUnitPriceWithTax).toBe(
            Math.round(76500 * 0.9),
        );

        // oil1 is not touched by this mutation but must still move to the 25% tier.
        const oil2LineId = lineFor(lines, 'E2E-OIL-002').id;
        const adjust = await gql(
            page,
            `mutation($lineId: ID!) {
                adjustOrderLine(orderLineId: $lineId, quantity: 3) {
                    __typename
                    ... on Order { lines { id quantity discountedUnitPriceWithTax productVariant { sku } } }
                }
            }`,
            { lineId: oil2LineId },
        );
        lines = (adjust.adjustOrderLine as { lines: OrderLine[] }).lines;

        const oil2Line = lineFor(lines, 'E2E-OIL-002');
        expect(oil2Line.quantity).toBe(3);
        expect(oil2Line.discountedUnitPriceWithTax).toBe(Math.round(49500 * 0.75));

        // Untouched by this mutation, yet already on the new tier in the same response.
        expect(lineFor(lines, 'E2E-OIL-001').discountedUnitPriceWithTax).toBe(
            Math.round(76500 * 0.75),
        );
    });
});
