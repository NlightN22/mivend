import { test, expect } from '@playwright/test';
import { readE2eOrder } from '../../helpers/e2e-order';

async function openE2eCustomerDetail(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/customers');
    const row = page.locator('.el-table-v2__row', { hasText: 'E2E Co' });
    await row.waitFor({ timeout: 15000 });
    await row.click({ position: { x: 20, y: 10 } });
    await expect(page).toHaveURL(/\/customers\/.+/);
}

test('customers page shows the client list with company meta and KPIs', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByText('Client list')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Active clients')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();

    const row = page.locator('.el-table-v2__row', { hasText: 'E2E Co' });
    await expect(row).toBeVisible();
});

test('customers page CSV export downloads a file', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByText('Client list')).toBeVisible({ timeout: 15000 });

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('customers.csv');
});

test('clicking a customer row navigates to the customer detail page', async ({ page }) => {
    await openE2eCustomerDetail(page);
});

test('customer detail Overview tab shows contacts, price type and trading points', async ({
    page,
}) => {
    await openE2eCustomerDetail(page);
    await page.waitForLoadState('networkidle');

    // Overview is the default tab — no click needed.
    await expect(page.getByText('WHOLESALE')).toBeVisible();
    await expect(page.getByText('Trading points')).toBeVisible();
    await expect(page.getByText('E2E Trading Point')).toBeVisible();
    await expect(page.getByText('E2E North Depot')).toBeVisible();
    await expect(page.getByText('E2E Warehouse')).toBeVisible();

    await expect(page.getByText('Sales last 30 days')).toBeVisible();
    await expect(page.getByText('Open orders')).toBeVisible();
});

test('customer detail Orders tab shows the seeded e2e order', async ({ page }) => {
    const order = readE2eOrder();
    await openE2eCustomerDetail(page);

    await page.getByRole('button', { name: 'Orders' }).click();
    await expect(page.getByText(order.code)).toBeVisible({ timeout: 15000 });
});

test('customer detail Discounts tab shows a grant scoped to this customer (positive)', async ({
    page,
}) => {
    await openE2eCustomerDetail(page);

    await page.getByRole('button', { name: 'Discounts' }).click();
    // global-setup.ts seeds an approved DiscountGrant scoped to the e2e counterparty at 8% —
    // via the real requestDiscountGrant -> decideDiscountGrantRequest workflow, not a DB
    // bypass — see DiscountGrantService.decideAndApply.
    await expect(page.getByText('8%')).toBeVisible({ timeout: 15000 });
});

test('customer detail Discounts tab does not leak a grant scoped to another customer (negative)', async ({
    page,
}) => {
    await openE2eCustomerDetail(page);

    await page.getByRole('button', { name: 'Discounts' }).click();
    await expect(page.getByText('8%')).toBeVisible({ timeout: 15000 });
    // global-setup.ts also seeds an approved DiscountGrant at 99%, but scoped only to
    // E2E_OTHER_COUNTERPARTY_ID — DiscountGrantService.findForCounterparty must exclude it
    // from this customer's tab (the bug this whole query was written to fix).
    await expect(page.getByText('99%')).not.toBeVisible();
});

test('customer detail Documents tab shows the customer document list', async ({ page }) => {
    await openE2eCustomerDetail(page);

    await page.getByRole('button', { name: 'Documents' }).click();
    // Documents are seeded independently of this spec (see other e2e specs' document fixtures) —
    // assert on the tab rendering real rows rather than a specific count, which would make this
    // test brittle against unrelated seed changes.
    await expect(page.getByText('contract').first()).toBeVisible({ timeout: 15000 });
});
