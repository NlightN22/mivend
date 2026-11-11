import { test, expect } from '@playwright/test';

test('the user block opens a menu with account settings and closes on Escape @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.locator('.mv-app-topbar__user').click();
    const link = page.getByRole('menuitem', { name: 'Password and security' });
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
    await page.getByRole('menuitem', { name: 'Password and security' }).click();
    await expect(page).toHaveURL(/\/settings\/security$/);
});

test('the menu switches the theme, keeps it after reload and ends with Log out @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.locator('.mv-app-topbar__user').click();
    await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('.mv-app-topbar__user').click();
    await expect(page.getByRole('menuitemradio', { name: 'Dark', exact: true })).toHaveAttribute(
        'aria-checked',
        'true',
    );
    await page.getByRole('menuitemradio', { name: 'Auto' }).click();
    await expect(page.getByRole('menuitem').last()).toHaveText('Log out');
});

test('the menu shows who is signed in @on:manager-operator @read-only', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.locator('.mv-app-topbar__user').click();
    const menu = page.getByRole('menu', { name: 'Account' });
    await expect(menu.locator('.user-menu__name')).not.toBeEmpty();
    await expect(menu.getByRole('menuitemradio')).toHaveCount(3);
});

test('the menu is reachable at phone width @on:manager-operator @read-only', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    await page.locator('.mv-app-topbar__user').click();
    await expect(page.getByRole('menuitem', { name: 'Log out' })).toBeVisible();
    await expect(page.locator('.mv-logo__name')).toBeHidden();
});

test('the menu takes focus on open and moves with the arrow keys @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.locator('.mv-app-topbar__user').click();
    const link = page.getByRole('menuitem', { name: 'Password and security' });
    await expect(link).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitemradio').first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(link).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.mv-app-topbar__user')).toBeFocused();
});

test('the phone search button takes over the header row and the cross restores it @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const field = page.getByRole('searchbox');
    await expect(field).toBeFocused();
    await expect(page.locator('.mv-app-topbar__user')).toBeHidden();
    await page.getByRole('button', { name: 'Close search' }).click();
    await expect(field).toBeHidden();
    await expect(page.locator('.mv-app-topbar__user')).toBeVisible();
});

test('submitting the phone search opens the customers list with the text @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('searchbox').fill('alpha');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/customers\?.*search=alpha/);
});
