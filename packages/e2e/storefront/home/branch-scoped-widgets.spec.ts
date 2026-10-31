import { test, expect } from '@playwright/test';
import { SUPERADMIN } from '../../fixtures/accounts';
import { readVisIds, type VisIds } from '../../fixtures/visibility/ids';
import { VIS_PASSWORD, customerEmail, type CustomerKey } from '../../fixtures/visibility/plan';
import { WIDGET_PRODUCTS } from '../../fixtures/visibility/widget-products';
import { shopGql, shopLoginCookie } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import { cancelTestOrder } from '../../helpers/manager-order';
import { openStorefrontAs } from '../../visibility/session';

// Test plan (#298): widgets offer only products in stock at a warehouse of the viewer's branch.
// Seed: product A is stocked at branch A's warehouse only, product B at branch B's only; both are
// new and on sale; customer-a/customer-b belong to branches A/B. Popular needs sales, so each
// customer orders its own branch's product. One case per widget and viewer, API ids plus home UI.

type Side = 'a' | 'b';
const SIDES: { side: Side; customer: CustomerKey; other: Side }[] = [
    { side: 'a', customer: 'customer-a', other: 'b' },
    { side: 'b', customer: 'customer-b', other: 'a' },
];
const WIDGETS = [
    { field: 'newArrivalProductIds', query: '{ newArrivalProductIds(take: 50, sinceDays: 7) }' },
    { field: 'saleProductIds', query: '{ saleProductIds(take: 50) }' },
    { field: 'popularProductIds', query: '{ popularProductIds(take: 50) }' },
] as const;
const HEADINGS = ['New Arrivals', 'On Sale', 'Popular products'];

const productIds = {} as Record<Side, string>;
const cookies = {} as Record<Side, string>;
const placedOrderIds: string[] = [];
let admin: string;
let vis: VisIds;

async function placeOrder(side: Side, customer: CustomerKey): Promise<void> {
    const shop = <T>(query: string, variables?: Record<string, unknown>): Promise<T> =>
        shopGql<T>(query, variables, cookies[side]);
    await shop(`mutation($id: ID!) { setPreferredTradingPoint(tradingPointId: $id) }`, {
        id: vis.points[customer === 'customer-a' ? 'a-own' : 'b-own'],
    });
    const found = await shop<{ product: { variants: { id: string }[] } | null }>(
        `query($s: String!) { product(slug: $s) { variants { id } } }`,
        { s: WIDGET_PRODUCTS[side].slug },
    );
    const variantId = found.product?.variants[0]?.id;
    if (!variantId) throw new Error(`${WIDGET_PRODUCTS[side].sku} is not visible to ${customer}`);
    const added = await shop<{ addItemToOrder: { __typename: string; id?: string } }>(
        `mutation($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 1) {
            __typename ... on Order { id } ... on ErrorResult { message } } }`,
        { id: variantId },
    );
    if (added.addItemToOrder.__typename !== 'Order' || !added.addItemToOrder.id)
        throw new Error(`addItemToOrder: ${JSON.stringify(added)}`);
    placedOrderIds.push(added.addItemToOrder.id);
    const methods = await shop<{ eligibleShippingMethods: { id: string; code: string }[] }>(
        `{ eligibleShippingMethods { id code } }`,
    );
    const pickup = methods.eligibleShippingMethods.find(m => m.code === 'pickup');
    if (!pickup) throw new Error('No pickup shipping method');
    await shop(
        `mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { __typename } }`,
        {
            id: [pickup.id],
        },
    );
    await shop(`mutation { transitionOrderToState(state: "ArrangingPayment") { __typename } }`);
}

async function widgetIds(side: Side, query: string, field: string): Promise<string[]> {
    return (await shopGql<Record<string, string[]>>(query, undefined, cookies[side]))[field];
}

test.describe.serial('Home widgets only offer products stocked at the viewer branch', () => {
    test.beforeAll(async () => {
        admin = await adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);
        vis = await readVisIds(admin);
        for (const { side, customer } of SIDES) {
            cookies[side] = await shopLoginCookie(customerEmail(customer), VIS_PASSWORD);
            const product = await shopGql<{ product: { id: string } | null }>(
                `query($s: String!) { product(slug: $s) { id } }`,
                { s: WIDGET_PRODUCTS[side].slug },
                cookies[side],
            );
            if (!product.product) throw new Error(`${WIDGET_PRODUCTS[side].slug} is not seeded`);
            productIds[side] = product.product.id;
            await placeOrder(side, customer);
        }
    });

    test.afterAll(async () => {
        for (const id of placedOrderIds) await cancelTestOrder(admin, id);
    });

    for (const { side, customer, other } of SIDES) {
        for (const { field, query } of WIDGETS) {
            test(`${field}: ${customer} gets its branch product, not the other branch's`, async () => {
                test.setTimeout(120_000);
                // The popular ranking is cached for up to a minute on the server.
                await expect
                    .poll(() => widgetIds(side, query, field), {
                        timeout: 90_000,
                        intervals: [2000],
                    })
                    .toContain(productIds[side]);
                expect(await widgetIds(side, query, field)).not.toContain(productIds[other]);
            });
        }

        test(`home page of ${customer}: widget cards link to its branch product only`, async ({
            browser,
        }) => {
            const session = await openStorefrontAs(browser, customer);
            try {
                await session.page.goto('/');
                for (const name of HEADINGS) {
                    const heading = session.page.getByRole('heading', { name });
                    await expect(heading).toBeVisible({ timeout: 20000 });
                    const section = session.page.locator('section.psr', { has: heading });
                    await expect(
                        section.locator(`a[href*="${WIDGET_PRODUCTS[side].slug}"]`).first(),
                    ).toBeVisible({ timeout: 20000 });
                    await expect(
                        section.locator(`a[href*="${WIDGET_PRODUCTS[other].slug}"]`),
                    ).toHaveCount(0);
                }
            } finally {
                await session.context.close();
            }
        });
    }
});
