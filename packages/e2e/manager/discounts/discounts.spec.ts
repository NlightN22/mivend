import { test, expect } from '@playwright/test';

// Real server-side pagination + filtering for both sections of /discounts (issue #39 follow-up):
// "Materialized grants" (DiscountRule, real backend pagination via discountRulesPage) and
// "Pending / rejected requests" (discountGrantApproval ApprovalRequests, via the already-real-
// paginated approvalRequestsByType). See api/discounts.ts and DiscountRuleService.findAllPaginated.
test('discounts page loads both sections with KPIs and at least one seeded materialized grant', async ({
    page,
}) => {
    await page.goto('/discounts');
    await expect(page.getByRole('heading', { name: 'Discount Grants' })).toBeVisible({
        timeout: 15000,
    });
    await expect(page.getByText('Active grants')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Materialized grants' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pending / rejected requests' })).toBeVisible();

    const table = page.locator('.el-table-v2__row');
    await expect(table.first()).toBeVisible({ timeout: 15000 });
});

test('materialized grants search filters server-side', async ({ page }) => {
    await page.goto('/discounts');
    await expect(page.getByRole('heading', { name: 'Materialized grants' })).toBeVisible({
        timeout: 15000,
    });
    await expect(page.locator('.el-table-v2__row').first()).toBeVisible({ timeout: 15000 });

    await page
        .getByPlaceholder('Price type, product group or customer...')
        .fill('zzz-no-match-xyz');
    await expect(page.getByText(/No discount grants/i).first()).toBeVisible({ timeout: 10000 });
});
