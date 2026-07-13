import type { Page } from '@playwright/test';

export async function loginAsManager(
    page: Page,
    username: string,
    password: string,
): Promise<void> {
    await page.goto('/login');
    await page.locator('input[type="text"]').fill(username);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(url => !url.pathname.includes('/login'));
}
