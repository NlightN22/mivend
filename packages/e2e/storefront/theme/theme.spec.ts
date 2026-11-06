import { test, expect, type Page } from '@playwright/test';

const html = (page: Page): ReturnType<Page['locator']> => page.locator('html');

async function chooseTheme(page: Page, name: 'System' | 'Light' | 'Dark'): Promise<void> {
    await page.getByRole('button', { name: 'Account' }).first().click();
    await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name }).click();
}

test.describe('Storefront theme', () => {
    test('is set from the system setting before the app mounts, then follows it live', async ({
        page,
    }) => {
        await page.addInitScript(() => {
            new MutationObserver((_, observer) => {
                const app = document.getElementById('app');
                if (app?.childElementCount) {
                    (window as unknown as { themeAtMount?: string }).themeAtMount =
                        document.documentElement.dataset.theme;
                    observer.disconnect();
                }
            }).observe(document, { childList: true, subtree: true });
        });
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.goto('/');
        await expect(page.locator('#app > *').first()).toBeVisible({ timeout: 20000 });

        expect(
            await page.evaluate(
                () => (window as unknown as { themeAtMount?: string }).themeAtMount,
            ),
        ).toBe('dark');
        await expect(html(page)).toHaveAttribute('data-theme', 'dark');

        await page.emulateMedia({ colorScheme: 'light' });
        await expect(html(page)).toHaveAttribute('data-theme', 'light');
    });

    test('a choice made in the account menu survives a reload and beats the system setting', async ({
        page,
    }) => {
        await page.emulateMedia({ colorScheme: 'light' });
        await page.goto('/');
        await expect(html(page)).toHaveAttribute('data-theme', 'light');

        await chooseTheme(page, 'Dark');
        await expect(html(page)).toHaveAttribute('data-theme', 'dark');
        await page.reload();
        await expect(html(page)).toHaveAttribute('data-theme', 'dark');

        await page.emulateMedia({ colorScheme: 'dark' });
        await chooseTheme(page, 'Light');
        await page.reload();
        await expect(html(page)).toHaveAttribute('data-theme', 'light');

        await chooseTheme(page, 'System');
        await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    });
});
