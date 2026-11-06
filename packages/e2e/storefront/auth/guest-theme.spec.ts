import { test, expect } from '@playwright/test';

test.describe('Guest theme switch', () => {
    test('a guest picks the theme in the header, it is remembered, and System follows the OS again', async ({
        page,
    }) => {
        // Keep the page a guest: the stack's session can resolve to a customer, which swaps the header.
        await page.route('**/shop-api', async route => {
            const body = route.request().postData() ?? '';
            if (body.includes('ActiveCustomerForAuth')) {
                await route.fulfill({
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { activeCustomer: null } }),
                });
            } else {
                await route.continue();
            }
        });
        await page.emulateMedia({ colorScheme: 'light' });
        await page.goto('/catalog');
        const html = page.locator('html');
        const switcher = page.getByRole('group', { name: 'Theme' });
        await expect(html).toHaveAttribute('data-theme', 'light');

        await switcher.getByRole('button', { name: 'Dark' }).click();
        await expect(html).toHaveAttribute('data-theme', 'dark');
        expect(await page.evaluate(() => localStorage.getItem('mivend.theme'))).toBe('dark');

        await switcher.getByRole('button', { name: 'System' }).click();
        await expect(html).toHaveAttribute('data-theme', 'light');

        await switcher.getByRole('button', { name: 'Dark' }).click();
        await page.goto('/login');
        await expect(html).toHaveAttribute('data-theme', 'dark');
    });
});
