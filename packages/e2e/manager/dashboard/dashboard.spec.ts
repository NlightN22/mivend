import { adminTokenFor } from '../../helpers/api-tokens';
import { test, expect } from '@playwright/test';
import { adminGql } from '../../helpers/api';
import { cancelTestOrder, createConfirmedOrder } from '../../helpers/manager-order';
import { E2E_CUSTOMER } from '../../fixtures/seed';
import { formatDocumentNumber } from '../../helpers/e2e-order';

// One spec runs under three role projects, each pre-authenticated as a different seeded role.
// Expected cards per role must match api/dashboard-config.ts, not be hardcoded here.
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

// Order code also appears in the Activity feed text; scope to the table cell to avoid
// a Playwright strict-mode match across both panels.
function orderCellLocator(
    page: import('@playwright/test').Page,
    code: string,
): import('@playwright/test').Locator {
    return page.locator('.el-table-v2__cell-text', { hasText: formatDocumentNumber(code) });
}

test.describe('Recent orders filter chips', () => {
    // recentOrdersList is a take:20 window, so the global-setup order can age out of it.
    // Create a fresh order right before these tests; single-worker runs make it the newest.
    let orderId: string;
    let orderCode: string;

    test.beforeAll(async () => {
        const token = await adminTokenFor('ivan.operator@mivend.dev', 'Password123!');

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

        // EventBus.publish() does not await fire-and-forget subscribers, so branchId may still be null.
        // Poll visibleOrders until it settles; a fixed delay is not a reliable fix.
        for (let attempt = 0; attempt < 20; attempt++) {
            const check = await adminGql<{
                visibleOrders: { items: { customFields: { branchId: string | null } }[] };
            }>(
                `query($code: String!) {
                    visibleOrders(options: { filter: { code: { eq: $code } } }) {
                        items { customFields { branchId } }
                    }
                }`,
                { code: orderCode },
                token,
            );
            if (check.data.visibleOrders.items[0]?.customFields.branchId) break;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    });

    test.afterAll(async () => {
        if (!orderId) return;
        const token = await adminTokenFor('ivan.operator@mivend.dev', 'Password123!');
        await cancelTestOrder(token, orderId);
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
