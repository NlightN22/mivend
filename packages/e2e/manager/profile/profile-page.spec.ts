import { test, expect } from '@playwright/test';

test('the profile page shows the account and keeps the theme after reload @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
    await expect(page.getByText('ivan.operator@mivend.dev')).toBeVisible();

    const theme = page.getByRole('group', { name: 'Theme' });
    await theme.getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(
        page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Auto' }).click();
});

test('the profile page switches the language and the user menu holds no system settings @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.goto('/profile');
    await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'RU' }).click();
    await expect(page.getByRole('heading', { name: 'Профиль', exact: true })).toBeVisible();
    await page.getByRole('group', { name: 'Язык' }).getByRole('button', { name: 'EN' }).click();
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();

    await page.locator('.mv-app-topbar__user').click();
    const menu = page.getByRole('menu', { name: 'Account' });
    await expect(menu.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'System settings' })).toHaveCount(0);
});
