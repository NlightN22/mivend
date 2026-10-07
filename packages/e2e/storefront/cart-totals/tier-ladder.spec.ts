import { test, expect } from './fixture';
import {
    addSku,
    expectConsistent,
    expectUiMatchesApi,
    fetchCart,
    settledCart,
    clearCart,
    type Cart,
} from './cart-helpers';
import { gql } from '../orders/helpers';

const LADDER_SKUS = ['E2E-OIL-001', 'E2E-OIL-002', 'E2E-OIL-003'];
const OTHER_SKUS = ['E2E-FLT-001', 'E2E-BRK-001'];

async function buildLadderCart(page: import('@playwright/test').Page): Promise<Cart> {
    await addSku(page, LADDER_SKUS[0], 1);
    await addSku(page, LADDER_SKUS[1], 1);
    await addSku(page, OTHER_SKUS[0], 2);
    await addSku(page, LADDER_SKUS[2], 1);
    await addSku(page, OTHER_SKUS[1], 1);
    return fetchCart(page);
}

async function setQuantity(
    page: import('@playwright/test').Page,
    cart: Cart,
    sku: string,
    quantity: number,
): Promise<void> {
    const line = cart.lines.find(l => l.productVariant.sku === sku);
    if (!line) throw new Error(`No line for ${sku}`);
    await gql(
        page,
        `mutation($id: ID!, $q: Int!) { adjustOrderLine(orderLineId: $id, quantity: $q) { __typename } }`,
        { id: line.id, q: quantity },
    );
}

test.describe('Cart tier ladder @cart-totals', () => {
    test.setTimeout(120000);
    test('rapid build of a multi-line same-brand cart: total equals lines immediately and after settling', async ({
        page,
    }) => {
        await clearCart(page);
        const immediate = await buildLadderCart(page);
        expect(immediate.lines).toHaveLength(5);
        expectConsistent(immediate, 'immediate read');
        const settled = await settledCart(page);
        expectConsistent(settled, 'settled read');
        await expectUiMatchesApi(page, settled);
    });

    test('same ladder cart built 6 times gives identical totals', async ({ page }) => {
        const seen: { total: number; lines: number[] }[] = [];
        for (let i = 0; i < 6; i++) {
            await clearCart(page);
            const immediate = await buildLadderCart(page);
            expectConsistent(immediate, 'immediate read');
            const settled = await settledCart(page);
            expectConsistent(settled, 'settled read');
            seen.push({
                total: settled.totalWithTax,
                lines: settled.lines.map(l => l.linePriceWithTax).sort((a, b) => a - b),
            });
        }
        for (const s of seen) expect(s).toEqual(seen[0]);
    });

    test('quantity changes crossing a ladder threshold up and down stay consistent', async ({
        page,
    }) => {
        const start = await buildLadderCart(page);
        const base = await settledCart(page);
        expectConsistent(base, 'base');

        await setQuantity(page, start, LADDER_SKUS[0], 3);
        const up = await settledCart(page);
        expectConsistent(up, 'after threshold up');
        await expectUiMatchesApi(page, up);
        const upSibling = up.lines.find(l => l.productVariant.sku === LADDER_SKUS[1])!;
        const baseSibling = base.lines.find(l => l.productVariant.sku === LADDER_SKUS[1])!;
        expect(upSibling.unitPrice, 'sibling unit price drops after the tier unlocks').toBeLessThan(
            baseSibling.unitPrice,
        );

        await setQuantity(page, up, LADDER_SKUS[0], 1);
        const down = await settledCart(page);
        expectConsistent(down, 'after threshold down');
        await expectUiMatchesApi(page, down);
        expect(down.totalWithTax).toBe(base.totalWithTax);
    });

    test('removing a middle line re-prices remaining siblings consistently', async ({ page }) => {
        const start = await buildLadderCart(page);
        await setQuantity(page, start, LADDER_SKUS[0], 3);
        const before = await settledCart(page);
        const middle = before.lines.find(l => l.productVariant.sku === LADDER_SKUS[1])!;
        await gql(page, `mutation($id: ID!) { removeOrderLine(orderLineId: $id) { __typename } }`, {
            id: middle.id,
        });
        const immediate = await fetchCart(page);
        expect(immediate.lines).toHaveLength(before.lines.length - 1);
        expectConsistent(immediate, 'immediate read');
        const after = await settledCart(page);
        expectConsistent(after, 'after removal');
        await expectUiMatchesApi(page, after);
    });
});
