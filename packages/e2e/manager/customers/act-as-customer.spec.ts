import { test, expect } from '@playwright/test';

test('the customer card starts acting as this customer and opens the storefront ticket page in a new tab @on:manager-operator', async ({
    page,
}) => {
    await page.goto('/customers?search=E2E%20Co');
    const row = page.getByRole('row').filter({ hasText: 'E2E Co' }).first();
    await row.waitFor({ timeout: 15000 });
    await row.getByRole('link', { name: /E2E Co/ }).click();
    await expect(page).toHaveURL(/\/customers\/.+/);

    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Act as customer' }).click();
    const popup = await popupPromise;
    await popup.waitForURL(/\/acting#ticket=.+/, { timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Act as customer' })).toBeEnabled();
});
