import { test, expect, type Browser, type Page } from '@playwright/test';
import { E2E_BROWSER_USER_AGENT } from '../../helpers/user-agent';
import { E2E_CUSTOMER } from '../../fixtures/seed';

// A fresh login per test: logging out only ends this session, never the shared storageState one.
async function loggedInPage(
    browser: Browser,
    viewport: { width: number; height: number },
): Promise<Page> {
    const context = await browser.newContext({ userAgent: E2E_BROWSER_USER_AGENT, viewport });
    const page = await context.newPage();
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(E2E_CUSTOMER.email);
    await page.locator('input[type="password"]').fill(E2E_CUSTOMER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(url => !url.pathname.includes('/login'));
    return page;
}

test.describe('Header log out', () => {
    test('desktop: Account dropdown logs out and closes on Escape', async ({ browser }) => {
        const page = await loggedInPage(browser, { width: 1440, height: 900 });
        try {
            const trigger = page.getByRole('button', { name: 'Account' });
            await trigger.click();
            await expect(trigger).toHaveAttribute('aria-expanded', 'true');
            await page.keyboard.press('Escape');
            await expect(trigger).toHaveAttribute('aria-expanded', 'false');

            await trigger.click();
            await page.getByRole('button', { name: 'Sign out' }).click();
            await page.waitForURL(url => url.pathname.includes('/login'));
        } finally {
            await page.context().close();
        }
    });

    test('mobile: More sheet logs out and the header has no burger', async ({ browser }) => {
        const page = await loggedInPage(browser, { width: 390, height: 844 });
        try {
            await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);
            const tabs = page.getByRole('navigation', { name: 'Main navigation' });
            await expect(tabs.getByRole('link', { name: 'Orders' })).toBeVisible();

            await tabs.getByRole('button', { name: 'More' }).click();
            const sheet = page.getByRole('dialog');
            await expect(sheet).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(sheet).toBeHidden();

            await tabs.getByRole('button', { name: 'More' }).click();
            await sheet.getByRole('button', { name: 'Sign out' }).click();
            await page.waitForURL(url => url.pathname.includes('/login'));
        } finally {
            await page.context().close();
        }
    });
});
