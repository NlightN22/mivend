import { test, expect } from '@playwright/test';
import { readE2eOrder } from '../../helpers/e2e-order';

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

// The e2e order (global-setup.ts's createConfirmedOrder) always lands in PaymentSettled and is
// placed "today" (created fresh by global-setup on this run) — a real, deterministic fixture
// for the Recent orders filter chips, rather than fabricated rows. See DashboardPage.vue's
// filteredOrders: 'in-progress' matches state PaymentAuthorized, 'awaiting-shipment' matches
// PaymentSettled, 'today' matches orderPlacedAt === today.
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
    test('"All" chip shows the seeded order (positive)', async ({ page }) => {
        const order = readE2eOrder();
        await gotoDashboardWithOrdersLoaded(page);
        await page.getByRole('button', { name: 'All', exact: true }).click();
        await expect(orderCellLocator(page, order.code).first()).toBeVisible({ timeout: 15000 });
    });

    test('"Awaiting shipment" chip shows the seeded order — PaymentSettled (positive)', async ({
        page,
    }) => {
        const order = readE2eOrder();
        await gotoDashboardWithOrdersLoaded(page);
        await page.getByRole('button', { name: 'Awaiting shipment', exact: true }).click();
        await expect(orderCellLocator(page, order.code).first()).toBeVisible({ timeout: 15000 });
    });

    test('"Today\'s" chip shows the seeded order — placed today (positive)', async ({ page }) => {
        const order = readE2eOrder();
        await gotoDashboardWithOrdersLoaded(page);
        await page.getByRole('button', { name: "Today's", exact: true }).click();
        await expect(orderCellLocator(page, order.code).first()).toBeVisible({ timeout: 15000 });
    });

    test('"In progress" chip hides the seeded order — it is PaymentSettled, not PaymentAuthorized (negative)', async ({
        page,
    }) => {
        const order = readE2eOrder();
        await gotoDashboardWithOrdersLoaded(page);
        // Establish the order is present under "All" first, so the absence below is a real
        // filter effect and not the panel failing to load at all.
        await expect(orderCellLocator(page, order.code).first()).toBeVisible({ timeout: 15000 });
        await page.getByRole('button', { name: 'In progress', exact: true }).click();
        await expect(orderCellLocator(page, order.code)).toHaveCount(0);
    });
});
