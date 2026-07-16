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

test.describe('Spend-amount-tiered discount', () => {
    test('unit price drops to the amount tier once the spend threshold is reached', async ({
        page,
    }) => {
        await clearCart(page);
        const variantId = await findVariantId(page, 'E2E-BRK-001');

        // First unit: 1080₽ spent, below the 2000₽ amount-tier threshold — the brand-specific
        // amount rule doesn't apply yet, but the e2e customer's own account-wide 8% grant
        // (facet-less by design, see global-setup.ts's grantInput) still does — expect the
        // final discounted price (108000 * 0.92 = 99360), not the undiscounted base.
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
        const firstLine = lineFor(
            (firstAdd.addItemToOrder as { lines: OrderLine[] }).lines,
            'E2E-BRK-001',
        );
        expect(firstLine.unitPrice).toBe(Math.round(108000 * 0.92));

        // Second unit: 2160₽ spent, crosses the 2000₽ threshold — 30% tier kicks in.
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
        const line = lineFor(
            (secondAdd.addItemToOrder as { lines: OrderLine[] }).lines,
            'E2E-BRK-001',
        );
        expect(line.quantity).toBe(2);
        expect(line.unitPrice).toBe(Math.round(108000 * 0.7));
    });
});
