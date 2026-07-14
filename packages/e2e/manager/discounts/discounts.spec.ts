import { test, expect } from '@playwright/test';

// Smoke coverage added alongside issue #39's pagination fixes — discountRules/discountGrants/
// approvalRequestsByType(discountGrantApproval) all changed shape (bounded take:200, and
// approvalRequestsByType moved to a paginated { items, totalItems } response) and this page
// merges all three client-side (see api/discounts.ts's buildDiscountRows). No existing e2e
// coverage existed for this page before — this is a first pass, not exhaustive.
test('discounts page loads the grant registry with KPIs and at least one seeded row', async ({
    page,
}) => {
    await page.goto('/discounts');
    await expect(page.getByRole('heading', { name: 'Discount Grants' })).toBeVisible({
        timeout: 15000,
    });
    await expect(page.getByText('Active grants')).toBeVisible();
    await expect(
        page.locator('.discounts-page__kpi-label', { hasText: 'Pending approval' }),
    ).toBeVisible();

    const table = page.locator('table, .el-table-v2__row');
    await expect(table.first()).toBeVisible({ timeout: 15000 });
});

test('discounts page search filters the grant list', async ({ page }) => {
    await page.goto('/discounts');
    await expect(page.getByRole('heading', { name: 'Discount Grants' })).toBeVisible({
        timeout: 15000,
    });

    await page
        .getByPlaceholder('Customer, price type or product group...')
        .fill('zzz-no-match-xyz');
    await expect(
        page.getByText(/No discount grants/i).or(page.getByText(/no.*match/i)),
    ).toBeVisible({
        timeout: 10000,
    });
});
