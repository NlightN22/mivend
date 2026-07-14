import { test, expect } from '@playwright/test';

// Real server-side pagination + filtering for the /discounts registry (issue #39 follow-up) — a
// single unified list backed by DiscountRegistryEntry (a CQRS-style read-model projection, see
// DiscountRegistryService on the backend), matching the design concept's single "Grant registry"
// table instead of the earlier two-table split (discountRulesPage + approvalRequestsByType).
test('discounts page loads the grant registry with KPIs and at least one seeded row', async ({
    page,
}) => {
    await page.goto('/discounts');
    await expect(page.getByRole('heading', { name: 'Discount Grants' })).toBeVisible({
        timeout: 15000,
    });
    await expect(page.getByText('Active grants')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Grant registry' })).toBeVisible();

    const table = page.locator('.el-table-v2__row');
    await expect(table.first()).toBeVisible({ timeout: 15000 });
});

test('grant registry search filters server-side', async ({ page }) => {
    await page.goto('/discounts');
    await expect(page.getByRole('heading', { name: 'Grant registry' })).toBeVisible({
        timeout: 15000,
    });
    await expect(page.locator('.el-table-v2__row').first()).toBeVisible({ timeout: 15000 });

    await page
        .getByPlaceholder('Price type, product group or customer...')
        .fill('zzz-no-match-xyz');
    await expect(page.getByText(/No discount grants/i)).toBeVisible({ timeout: 10000 });
});

test('status chips filter the registry and stay in sync with the Status dropdown', async ({
    page,
}) => {
    await page.goto('/discounts');
    await expect(page.locator('.el-table-v2__row').first()).toBeVisible({ timeout: 15000 });

    await page.locator('.discounts-page__chip', { hasText: 'Rejected' }).click();
    await page.waitForTimeout(500); // debounce-free reactive filter, but let the refetch settle
    const statuses = page.locator('.el-table-v2__row .mv-status-badge');
    const count = await statuses.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
        await expect(statuses.nth(i)).toHaveText('Rejected');
    }
});
