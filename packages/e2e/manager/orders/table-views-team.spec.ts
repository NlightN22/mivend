import { test, expect, type Page } from '@playwright/test';

const trigger = (page: Page) => page.getByTestId('table-views-trigger');

async function deleteTeamView(page: Page, name: string): Promise<void> {
    await page.goto('/orders');
    await trigger(page).click();
    const item = page.locator('.mv-table-views__item', { hasText: name });
    if (await item.count()) await item.getByTitle('Delete').click();
}

test('a portal admin shares a view with the team and makes it the team default @on:manager-portal-admin', async ({
    page,
}) => {
    const name = `e2e team view ${Date.now()}`;
    try {
        await page.goto('/orders?view=overdue');
        await trigger(page).click();
        await page.getByTestId('table-views-name').fill(name);
        await page.getByTestId('table-views-scope').selectOption('SHARED');
        await page.getByTestId('table-views-save').click();
        await expect(trigger(page)).toContainText(name);

        // Saving leaves the panel open; a second trigger click would close it.
        const group = page.getByTestId('table-views-group-team');
        await expect(group).toBeVisible();
        const item = page.locator('.mv-table-views__item', { hasText: name });
        await item.getByTestId('table-views-toggle-default').click();
        await expect(item.getByTestId('table-views-default')).toBeVisible();

        await page.evaluate(() => localStorage.clear());
        await page.goto('/orders');
        await expect(trigger(page)).toContainText(name);

        await trigger(page).click();
        await page
            .locator('.mv-table-views__item', { hasText: name })
            .getByTestId('table-views-toggle-default')
            .click();
        await expect(page.getByTestId('table-views-default')).toHaveCount(0);
    } finally {
        await deleteTeamView(page, name);
    }
    await expect(page.getByTestId('table-views-panel').getByRole('button', { name })).toHaveCount(
        0,
    );
});

test('an operator cannot save a view for the team @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/orders');
    await trigger(page).click();
    await expect(page.getByTestId('table-views-name')).toBeVisible();
    await expect(page.getByTestId('table-views-scope')).toHaveCount(0);
});
