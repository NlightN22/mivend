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

test('the phone profile menu is a card under the avatar, not a bottom sheet @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    await page.locator('.mv-app-topbar__user').click();
    const card = page.locator('.mv-popover__popper');
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box?.y ?? 999).toBeLessThan(120);
    expect(box?.width ?? 999).toBeLessThanOrEqual(360);
});

test('typing in the phone search shows grouped results and a result opens its page @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/orders');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('searchbox').fill('E2E');
    const group = page.getByRole('heading', { name: 'Customers' });
    await expect(group).toBeVisible();
    await page.getByRole('option').first().click();
    await expect(page).toHaveURL(/\/customers\/\d+$/);
});

test('the phone search hints under two characters and says when nothing is found @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/orders');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('searchbox').fill('a');
    await expect(page.getByText('Type at least 2 characters')).toBeVisible();
    await page.getByRole('searchbox').fill('zzzqq');
    await expect(page.getByText('No results')).toBeVisible();
});

test('Enter in the phone search keeps the page and saves a recent query @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/orders');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('searchbox').fill('zzzqq');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/orders/);
    await page.getByRole('searchbox').fill('');
    await page.getByRole('button', { name: 'zzzqq', exact: true }).click();
    await expect(page.getByRole('searchbox')).toHaveValue('zzzqq');
    await page.getByRole('button', { name: 'Close search' }).click();
});

test('the desktop header search: Ctrl K, arrows, Enter opens, Escape closes @on:manager-operator @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.goto('/orders');
    await page.keyboard.press('Control+k');
    const box = page.locator('input.search-box__input');
    await expect(box).toBeFocused();
    await box.fill('E2E');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/customers\/\d+$/);
    await box.focus();
    await box.fill('E2E');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toBeHidden();
});
