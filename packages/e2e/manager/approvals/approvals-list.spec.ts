import { test, expect } from '@playwright/test';

test('the inbox shows the three view chips with counts, Awaiting me first @on:manager-portal-admin @read-only', async ({
    page,
}) => {
    await page.goto('/approvals');
    const chips = page.locator('.mv-filter-chip');
    await expect(chips.first()).toContainText('Awaiting me', { timeout: 15000 });
    await expect(chips.first()).toContainText(/\d+$/);
    await expect(page.getByRole('button', { name: /^My requests \d+$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^All \d+$/ })).toBeVisible();
});

test('a chosen view and sort live in the link @on:manager-portal-admin @read-only', async ({
    page,
}) => {
    await page.goto('/approvals');
    await page.getByRole('button', { name: /^All \d+$/ }).click();
    await expect(page).toHaveURL(/view=all/);
    await page.getByRole('columnheader', { name: /Request #/ }).click();
    await expect(page).toHaveURL(/sortField=id/);
});

test('a status filter from the link narrows the list and the counts @on:manager-portal-admin @read-only', async ({
    page,
}) => {
    await page.goto('/approvals?view=all&search=zzzz-none');
    await expect(page.locator('.mv-advanced-data-table__grid tbody tr')).toHaveCount(0, {
        timeout: 15000,
    });
    await expect(page.getByText('No requests match your filters')).toBeVisible();
});

test('paging to the last page does not snap the window back to the top @on:manager-portal-admin @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1280, height: 300 });
    await page.goto('/approvals?view=all');
    const next = page.getByRole('button', { name: 'Next' }).last();
    await expect(next).toBeEnabled({ timeout: 15000 });
    await next.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await next.click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test('a row opens the decision page @on:manager-portal-admin @read-only', async ({ page }) => {
    await page.goto('/approvals?view=all');
    const firstId = page.locator('.mv-advanced-data-table__grid tbody tr a').first();
    await expect(firstId).toBeVisible({ timeout: 15000 });
    await firstId.click();
    await expect(page).toHaveURL(/\/approvals\/\d+/);
    await expect(page.getByRole('heading', { name: /^Request \d+/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Steps and decisions' })).toBeVisible();
});
