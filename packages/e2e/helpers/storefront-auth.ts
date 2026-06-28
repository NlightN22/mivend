import type { Page } from '@playwright/test';

export async function loginAs(page: Page, email: string, password: string): Promise<void> {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.waitForURL(url => !url.pathname.includes('/login'));
}
