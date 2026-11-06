import { test, expect } from '@playwright/test';

// A column filter overlay must stay open and focused while the table reloads after the first keystroke.
test.describe('bulk activation column filter typing @on:manager-portal-admin', () => {
    test('a multi-character value can be typed into the Manager filter', async ({ page }) => {
        await page.goto('/bulk-operations/activate-customers');
        const header = page.locator('th').filter({ hasText: 'Manager' }).first();
        await header.locator('.p-datatable-filter button').click();
        const input = page.getByPlaceholder('Manager contains…');
        await input.click();
        await input.pressSequentially('abcdefghij', { delay: 150 });
        await expect(input).toBeFocused();
        await expect(input).toHaveValue('abcdefghij');
    });
});
