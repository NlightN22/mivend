import { test, expect } from '@playwright/test';

test('the user block opens a menu with account settings and closes on Escape @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.locator('.mv-app-topbar__user').click();
    const link = page.getByRole('menuitem', { name: 'Password and two-factor sign-in' });
    await expect(link).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Log out' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(link).toBeHidden();
});

test('the account settings item opens the security page @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.locator('.mv-app-topbar__user').click();
    await page.getByRole('menuitem', { name: 'Password and two-factor sign-in' }).click();
    await expect(page).toHaveURL(/\/settings\/security$/);
});
