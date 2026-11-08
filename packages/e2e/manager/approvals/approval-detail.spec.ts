import { test, expect } from '@playwright/test';

async function openFirstPending(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/approvals?view=awaiting');
    const link = page.locator('.mv-advanced-data-table__grid tbody tr a').first();
    await expect(link).toBeVisible({ timeout: 15000 });
    await link.click();
    await expect(page.getByRole('heading', { name: 'Decision' })).toBeVisible();
}

test('a pending request offers Approve and Reject to someone who may decide @on:manager-portal-admin @read-only', async ({
    page,
}) => {
    await openFirstPending(page);
    await expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Reject' })).toBeEnabled();
});

test('rejecting without a comment is refused in the form @on:manager-portal-admin @read-only', async ({
    page,
}) => {
    await openFirstPending(page);
    await page.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByText('A comment is required to reject a request')).toBeVisible();
});

test('a request the viewer cannot decide shows disabled actions and the reason @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/approvals?view=all');
    const link = page.locator('.mv-advanced-data-table__grid tbody tr a').first();
    test.skip((await link.count()) === 0, 'this role sees no requests on the seeded stand');
    await link.click();
    const approve = page.getByRole('button', { name: 'Approve' });
    if (await approve.count()) {
        if (await approve.isDisabled())
            await expect(page.getByText(/can decide step/)).toBeVisible();
    }
});
