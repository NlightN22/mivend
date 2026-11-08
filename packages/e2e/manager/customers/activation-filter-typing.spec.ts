import { test, expect } from '@playwright/test';

// Typing must not lose focus or characters while the table reloads after the first keystroke.
test.describe('bulk activation select step typing @on:manager-portal-admin', () => {
    test('a multi-character search can be typed into the toolbar search box', async ({ page }) => {
        await page.goto('/bulk-operations/counterparty-portal-access');
        const input = page.getByPlaceholder('Search company, legal name or INN…');
        await input.click();
        await input.pressSequentially('abcdefghij', { delay: 150 });
        await expect(input).toBeFocused();
        await expect(input).toHaveValue('abcdefghij');
    });

    test('a multi-character value can be typed into the Manager condition of the Filter builder', async ({
        page,
    }) => {
        await page.goto('/bulk-operations/counterparty-portal-access');
        await page.getByTestId('filter-trigger').click();
        await page.getByTestId('filter-column-manager').click();
        const input = page.getByTestId('filter-value');
        await input.click();
        await input.pressSequentially('abcdefghij', { delay: 150 });
        await expect(input).toBeFocused();
        await expect(input).toHaveValue('abcdefghij');
    });
});
