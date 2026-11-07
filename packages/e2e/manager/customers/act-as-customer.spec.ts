import { test, expect } from '@playwright/test';

test('the customer card starts acting as this customer and opens the storefront ticket page in a new tab @on:manager-operator', async ({
    page,
}) => {
    await page.goto('/customers');
    const row = page.locator('.el-table-v2__row', { hasText: 'E2E Co' });
    await row.waitFor({ timeout: 15000 });
    await row.click({ position: { x: 20, y: 10 } });
    await expect(page).toHaveURL(/\/customers\/.+/);

    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Act as customer' }).click();
    const popup = await popupPromise;
    await popup.waitForURL(/\/acting#ticket=.+/, { timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Act as customer' })).toBeEnabled();
});
