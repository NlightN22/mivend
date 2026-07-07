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

// Regression coverage for: two different SKUs of the same brand ('e2e-discount-brand')
// in the same order — Vendure only recalculates the OrderLine that was actually
// mutated, so without TierRebalanceService the sibling line would keep a stale price
// even after the shared facet's aggregate weight crosses a tier threshold.
test.describe('Volume-tiered discount — cross-line rebalance', () => {
    test('crossing the tier threshold on one line also rebalances a different pre-existing line of the same brand', async ({
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
                    ... on Order { lines { id quantity unitPrice productVariant { sku } } }
                }
            }`,
            { id: oil1 },
        );
        const oil1LineAfterAdd1 = lineFor(
            (add1.addItemToOrder as { lines: OrderLine[] }).lines,
            'E2E-OIL-001',
        );
        expect(oil1LineAfterAdd1.unitPrice).toBe(Math.round(76500 * 0.9));

        // Add oil2 at qty 1: aggregate weight 100 + 50 = 150kg — still under 200kg.
        const add2 = await gql(
            page,
            `mutation($id: ID!) {
                addItemToOrder(productVariantId: $id, quantity: 1) {
                    __typename
                    ... on Order { lines { id quantity unitPrice productVariant { sku } } }
                }
            }`,
            { id: oil2 },
        );
        let lines = (add2.addItemToOrder as { lines: OrderLine[] }).lines;
        expect(lineFor(lines, 'E2E-OIL-002').unitPrice).toBe(Math.round(49500 * 0.9));
        expect(lineFor(lines, 'E2E-OIL-001').unitPrice).toBe(Math.round(76500 * 0.9));

        // Bump oil2 to qty 3: aggregate weight 100 + 50*3 = 250kg — crosses the 200kg
        // tier (25%). oil2's own line recalculates normally; the assertion that matters
        // is that oil1 — untouched by this mutation — ALSO jumps to the 25% tier.
        const oil2LineId = lineFor(lines, 'E2E-OIL-002').id;
        const adjust = await gql(
            page,
            `mutation($lineId: ID!) {
                adjustOrderLine(orderLineId: $lineId, quantity: 3) {
                    __typename
                    ... on Order { lines { id quantity unitPrice productVariant { sku } } }
                }
            }`,
            { lineId: oil2LineId },
        );
        lines = (adjust.adjustOrderLine as { lines: OrderLine[] }).lines;

        const oil2Line = lineFor(lines, 'E2E-OIL-002');
        expect(oil2Line.quantity).toBe(3);
        expect(oil2Line.unitPrice).toBe(Math.round(49500 * 0.75));

        // oil1 — untouched by this mutation — must also land on the 25% tier, via the
        // async rebalance subscriber (runs after this mutation's transaction commits).
        await waitForUnitPrice(page, 'E2E-OIL-001', Math.round(76500 * 0.75));
    });
});
