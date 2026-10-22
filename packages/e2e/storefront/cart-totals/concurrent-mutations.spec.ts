import { test, expect } from './fixture';
import { addSku, clearCart, expectConsistent, fetchCart, type Cart } from './cart-helpers';
import { gql } from '../orders/helpers';

// Order-dependent discounts are computed inside each mutation's own transaction (#196): parallel
// mutations of one cart must end in the state a sequential build of the same quantities gives.
const START_SKUS = ['E2E-OIL-001', 'E2E-OIL-002', 'E2E-FLT-001'];
const ADDED_SKU = 'E2E-BRK-001';
const FINAL_QUANTITIES: Record<string, number> = {
    'E2E-OIL-001': 3,
    'E2E-OIL-002': 2,
    'E2E-FLT-001': 2,
    [ADDED_SKU]: 1,
};
const ROUNDS = 5;

type Page = import('@playwright/test').Page;

function finalState(cart: Cart): Record<string, { quantity: number; unit: number }> {
    return Object.fromEntries(
        cart.lines.map(l => [
            l.productVariant.sku,
            { quantity: l.quantity, unit: l.discountedUnitPriceWithTax },
        ]),
    );
}

async function adjust(page: Page, id: string, quantity: number): Promise<void> {
    const data = await gql(
        page,
        `mutation($id: ID!, $q: Int!) { adjustOrderLine(orderLineId: $id, quantity: $q) { __typename ... on ErrorResult { message } } }`,
        { id, q: quantity },
    );
    const result = data.adjustOrderLine as { __typename: string; message?: string };
    if (result.__typename !== 'Order') throw new Error(`adjustOrderLine: ${result.message}`);
}

async function sequentialReference(page: Page): Promise<Cart> {
    await clearCart(page);
    for (const [sku, quantity] of Object.entries(FINAL_QUANTITIES)) {
        await addSku(page, sku, quantity);
    }
    return fetchCart(page);
}

test.describe('Cart concurrent mutations @cart-totals', () => {
    test.setTimeout(180000);

    test('parallel adjust and add calls of one cart match a sequential build, read immediately', async ({
        page,
    }) => {
        const expected = finalState(await sequentialReference(page));

        for (let round = 0; round < ROUNDS; round++) {
            await clearCart(page);
            for (const sku of START_SKUS) await addSku(page, sku, 1);
            const start = await fetchCart(page);
            const lineId = (sku: string): string =>
                start.lines.find(l => l.productVariant.sku === sku)!.id;

            await Promise.all([
                ...START_SKUS.map(sku => adjust(page, lineId(sku), FINAL_QUANTITIES[sku])),
                addSku(page, ADDED_SKU, FINAL_QUANTITIES[ADDED_SKU]),
            ]);

            const immediate = await fetchCart(page);
            expectConsistent(immediate, `round ${round}`);
            expect(finalState(immediate), `round ${round}`).toEqual(expected);
        }
    });
});
