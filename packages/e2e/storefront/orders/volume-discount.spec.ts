import { test, expect } from '@playwright/test';
import { clearCart, gql } from './helpers';

interface OrderLine {
    quantity: number;
    unitPrice: number;
    productVariant: { sku: string };
}

async function findVariantId(page: import('@playwright/test').Page, sku: string): Promise<string> {
    const result = await gql(
        page,
        `query { search(input: { take: 30 }) { items { sku productVariantId } } }`,
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

test.describe('Volume-tiered discount', () => {
    test('unit price switches from the flat discount to the higher volume tier once the weight threshold is reached', async ({
        page,
    }) => {
        await clearCart(page);
        const variantId = await findVariantId(page, 'E2E-OIL-001');

        // First unit: only the flat 10% facet discount applies (weight 100kg < 200kg tier).
        const firstAdd = await gql(
            page,
            `mutation($id: ID!) {
                addItemToOrder(productVariantId: $id, quantity: 1) {
                    __typename
                    ... on Order { lines { quantity unitPrice productVariant { sku } } }
                }
            }`,
            { id: variantId },
        );
        const firstLines = (firstAdd.addItemToOrder as { lines: OrderLine[] }).lines;
        const flatDiscountedPrice = lineFor(firstLines, 'E2E-OIL-001').unitPrice;
        expect(flatDiscountedPrice).toBe(Math.round(76500 * 0.9));

        // Second unit crosses the 200kg threshold (2 * 100kg) — the 25% tier now wins.
        const secondAdd = await gql(
            page,
            `mutation($id: ID!) {
                addItemToOrder(productVariantId: $id, quantity: 1) {
                    __typename
                    ... on Order { lines { quantity unitPrice productVariant { sku } } }
                }
            }`,
            { id: variantId },
        );
        const secondLines = (secondAdd.addItemToOrder as { lines: OrderLine[] }).lines;
        const line = lineFor(secondLines, 'E2E-OIL-001');
        expect(line.quantity).toBe(2);
        expect(line.unitPrice).toBe(Math.round(76500 * 0.75));
        expect(line.unitPrice).toBeLessThan(flatDiscountedPrice);
    });
});
