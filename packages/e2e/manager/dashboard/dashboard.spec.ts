import { test, expect } from '@playwright/test';
import { adminGql } from '../../helpers/api';
import { createConfirmedOrder } from '../../helpers/manager-order';
import { E2E_CUSTOMER } from '../../fixtures/seed';

// One spec file runs against three Playwright projects (manager-operator, manager-manager,
// manager-department-head — see playwright.config.ts), each pre-authenticated as a different
// seeded role (.tests/accounts.md / infrastructure/scripts/seed-access-roles.mjs). Cards shown
// per role must match packages/manager/src/api/dashboard-config.ts.
const CARDS_BY_ROLE: Record<string, { visible: string[]; hidden: string[] }> = {
    'manager-operator': {
        visible: ['Department orders', 'Department clients'],
        hidden: ['My pending approval requests', 'Awaiting my decision', 'My clients'],
    },
    'manager-manager': {
        visible: ['Active orders', 'My pending approval requests', 'My clients'],
        hidden: ['Awaiting my decision', 'Department orders', 'Department clients'],
    },
    'manager-department-head': {
        visible: ['Awaiting my decision', 'Department orders', 'Department clients'],
        hidden: ['My pending approval requests', 'My clients'],
    },
};

test('dashboard shows the KPI cards for the current role', async ({ page }, testInfo) => {
    const expected = CARDS_BY_ROLE[testInfo.project.name];
    test.skip(!expected, `No KPI expectations defined for project "${testInfo.project.name}"`);

    await page.goto('/');
    await expect(page.getByText('Welcome back,')).toBeVisible();

    for (const label of expected.visible) {
        await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    for (const label of expected.hidden) {
        await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    }
});

test('dashboard shows recent orders and my approval requests panels', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Recent orders')).toBeVisible();
    await expect(page.getByText('My approval requests status')).toBeVisible();
});

// See DashboardPage.vue's filteredOrders: 'in-progress' matches state PaymentAuthorized,
// 'awaiting-shipment' matches PaymentSettled, 'today' matches orderPlacedAt === today.
async function gotoDashboardWithOrdersLoaded(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/');
    // Recent orders loads asynchronously after the initial paint — wait for the panel itself
    // before clicking a chip, otherwise the chip click can race the data fetch.
    await expect(page.getByText('Recent orders')).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState('networkidle');
}

// The order code also appears (as a text substring) in the Activity feed's "Order X placed by…"
// entry — scope to the Recent orders table's cell text specifically to avoid a strict-mode
// match across both panels.
function orderCellLocator(
    page: import('@playwright/test').Page,
    code: string,
): import('@playwright/test').Locator {
    return page.locator('.el-table-v2__cell-text', { hasText: code });
}

test.describe('Recent orders filter chips', () => {
    // `recentOrdersList` (packages/manager/src/api/dashboard.ts) is a real, unfiltered-by-
    // customer `take: 20, sort: orderPlacedAt DESC` window over the viewer's visible orders —
    // by product design, not a bug (it's "recent across my scope", not "recent for one
    // customer"). Depending on global-setup.ts's single order (created once, at the very start
    // of the whole e2e run) to still be within the last 20 by the time this describe block runs
    // is inherently fragile once ANY other spec creates more than 20 newer orders in the same
    // scope first — which is exactly what happened (real incident: orders-pagination.spec.ts
    // used to leave its fixture orders behind forever, see its own history). Rather than
    // asserting a position in a widget window that will always eventually be violated by
    // accumulation, create a fresh order right before these specific tests run — since e2e runs
    // single-worker/non-parallel (see playwright.config.ts), this guarantees it is THE most
    // recent order in the system at assertion time, not merely "hopefully in the top 20".
    let orderId: string;
    let orderCode: string;

    test.beforeAll(async () => {
        const login = await adminGql<{ login: { __typename: string } }>(
            `mutation($id: String!, $pw: String!) { login(username: $id, password: $pw) { __typename ... on CurrentUser { id } } }`,
            { id: 'ivan.operator@mivend.dev', pw: 'Password123!' },
        );
        const token = login.token;
        if (!token) throw new Error('Could not log in as operator to seed a fresh dashboard order');

        const customersResult = await adminGql<{
            customers: { items: { id: string; emailAddress: string }[] };
        }>(
            `query { customers(options: { take: 200 }) { items { id emailAddress } } }`,
            undefined,
            token,
        );
        const customerId = customersResult.data.customers.items.find(
            c => c.emailAddress === E2E_CUSTOMER.email,
        )?.id;
        if (!customerId)
            throw new Error(`Could not find Vendure customer for ${E2E_CUSTOMER.email}`);

        const variantsResult = await adminGql<{ productVariants: { items: { id: string }[] } }>(
            `query { productVariants(options: { filter: { sku: { eq: "E2E-OIL-001" } } }) { items { id } } }`,
            undefined,
            token,
        );
        const productVariantId = variantsResult.data.productVariants.items[0]?.id;
        if (!productVariantId) throw new Error('Could not find product variant E2E-OIL-001');

        const order = await createConfirmedOrder(token, customerId, productVariantId);
        orderId = order.id;
        orderCode = order.code;
    });

    test.afterAll(async () => {
        // Never leave this fixture order behind — see the beforeAll comment above for why.
        if (!orderId) return;
        const login = await adminGql<{ login: { __typename: string } }>(
            `mutation($id: String!, $pw: String!) { login(username: $id, password: $pw) { __typename ... on CurrentUser { id } } }`,
            { id: 'ivan.operator@mivend.dev', pw: 'Password123!' },
        );
        const token = login.token;
        if (!token) return;
        await adminGql(
            `mutation($input: CancelOrderInput!) { cancelOrder(input: $input) { __typename } }`,
            { input: { orderId } },
            token,
        );
    });

    test('"All" chip shows the seeded order (positive)', async ({ page }) => {
        await gotoDashboardWithOrdersLoaded(page);
        await page.getByRole('button', { name: 'All', exact: true }).click();
        await expect(orderCellLocator(page, orderCode).first()).toBeVisible({ timeout: 15000 });
    });

    test('"Awaiting shipment" chip shows the seeded order — PaymentSettled (positive)', async ({
        page,
    }) => {
        await gotoDashboardWithOrdersLoaded(page);
        await page.getByRole('button', { name: 'Awaiting shipment', exact: true }).click();
        await expect(orderCellLocator(page, orderCode).first()).toBeVisible({ timeout: 15000 });
    });

    test('"Today\'s" chip shows the seeded order — placed today (positive)', async ({ page }) => {
        await gotoDashboardWithOrdersLoaded(page);
        await page.getByRole('button', { name: "Today's", exact: true }).click();
        await expect(orderCellLocator(page, orderCode).first()).toBeVisible({ timeout: 15000 });
    });

    test('"In progress" chip hides the seeded order — it is PaymentSettled, not PaymentAuthorized (negative)', async ({
        page,
    }) => {
        await gotoDashboardWithOrdersLoaded(page);
        // Establish the order is present under "All" first, so the absence below is a real
        // filter effect and not the panel failing to load at all.
        await expect(orderCellLocator(page, orderCode).first()).toBeVisible({ timeout: 15000 });
        await page.getByRole('button', { name: 'In progress', exact: true }).click();
        await expect(orderCellLocator(page, orderCode)).toHaveCount(0);
    });
});
