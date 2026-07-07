import { test, expect } from '@playwright/test';
import { clearCart, gql } from './helpers';

interface OrderLine {
    id: string;
    quantity: number;
    unitPrice: number;
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

// TierRebalanceService runs as an async EventBus subscriber (after the triggering
// mutation's transaction commits), not inline with the mutation response — poll for
// the sibling line to catch up rather than asserting on a single immediate read.
async function waitForUnitPrice(
    page: import('@playwright/test').Page,
    sku: string,
    expected: number,
    timeoutMs = 5000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let last: number | undefined;
    while (Date.now() < deadline) {
        const result = await gql(
            page,
            `query { activeOrder { lines { id quantity unitPrice productVariant { sku } } } }`,
        );
        const line = lineFor((result.activeOrder as { lines: OrderLine[] }).lines, sku);
        last = line.unitPrice;
        if (last === expected) return;
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error(`Timed out waiting for ${sku} unitPrice=${expected}, last seen ${last}`);
}

// Same coverage as volume-discount-cross-line.spec.ts, but for the spend-amount metric
// ('e2e-amount-brand') instead of weight.
test.describe('Spend-amount-tiered discount — cross-line rebalance', () => {
    test('crossing the spend threshold on one line also rebalances a different pre-existing line of the same brand', async ({
        page,
    }) => {
        await clearCart(page);
        const brk1 = await findVariantId(page, 'E2E-BRK-001'); // 1080₽
        const brk2 = await findVariantId(page, 'E2E-BRK-002'); // 720₽

        // brk1 alone: 1080₽ spent — below the 2000₽ threshold, no discount.
        const add1 = await gql(
            page,
            `mutation($id: ID!) {
                addItemToOrder(productVariantId: $id, quantity: 1) {
                    __typename
                    ... on Order { lines { id quantity unitPrice productVariant { sku } } }
                }
            }`,
            { id: brk1 },
        );
        expect(
            lineFor((add1.addItemToOrder as { lines: OrderLine[] }).lines, 'E2E-BRK-001').unitPrice,
        ).toBe(108000);

        // Add brk2 at qty 1: aggregate spend 1080 + 720 = 1800₽ — still under 2000₽.
        const add2 = await gql(
            page,
            `mutation($id: ID!) {
                addItemToOrder(productVariantId: $id, quantity: 1) {
                    __typename
                    ... on Order { lines { id quantity unitPrice productVariant { sku } } }
                }
            }`,
            { id: brk2 },
        );
        let lines = (add2.addItemToOrder as { lines: OrderLine[] }).lines;
        expect(lineFor(lines, 'E2E-BRK-002').unitPrice).toBe(72000);
        expect(lineFor(lines, 'E2E-BRK-001').unitPrice).toBe(108000);

        // Bump brk2 to qty 2: aggregate spend 1080 + 720*2 = 2520₽ — crosses the 2000₽
        // tier (30%). brk1 — untouched by this mutation — must also drop to the tier.
        const brk2LineId = lineFor(lines, 'E2E-BRK-002').id;
        const adjust = await gql(
            page,
            `mutation($lineId: ID!) {
                adjustOrderLine(orderLineId: $lineId, quantity: 2) {
                    __typename
                    ... on Order { lines { id quantity unitPrice productVariant { sku } } }
                }
            }`,
            { lineId: brk2LineId },
        );
        lines = (adjust.adjustOrderLine as { lines: OrderLine[] }).lines;

        const brk2Line = lineFor(lines, 'E2E-BRK-002');
        expect(brk2Line.quantity).toBe(2);
        expect(brk2Line.unitPrice).toBe(Math.round(72000 * 0.7));

        // brk1 — untouched by this mutation — must also drop to the tier, via the async
        // rebalance subscriber (runs after this mutation's transaction commits).
        await waitForUnitPrice(page, 'E2E-BRK-001', Math.round(108000 * 0.7));
    });
});
