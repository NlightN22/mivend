import { test, expect } from '@playwright/test';

// Focused check for the mobile app-shell (bottom nav + "More" sheet + FAB) added this session —
// not a full per-role/per-page sweep, just proof the shell itself works at the concept's own
// 800px breakpoint. Runs against whichever role project executes it (see playwright.config.ts).
test.use({ viewport: { width: 390, height: 844 } });

test('mobile bottom nav navigates and the sidebar is hidden', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.mv-app-sidebar')).toBeHidden();

    const bottomNav = page.locator('.mv-app-mobile-nav');
    await expect(bottomNav).toBeVisible();

    await bottomNav.getByRole('link', { name: 'Customers' }).click();
    await expect(page).toHaveURL(/\/customers/);

    await bottomNav.getByRole('link', { name: 'Orders' }).click();
    await expect(page).toHaveURL(/\/orders/);
});

test('More sheet opens, lists secondary nav, and closes on backdrop click', async ({ page }) => {
    await page.goto('/');
    await page.locator('.mv-app-mobile-nav').getByRole('button', { name: 'More' }).click();

    const sheet = page.locator('.mv-mobile-sheet');
    await expect(sheet).toHaveClass(/mv-mobile-sheet--open/);
    await expect(sheet.getByRole('link', { name: 'Catalog' })).toBeVisible();

    await page.locator('.mv-mobile-sheet-backdrop').click();
    await expect(sheet).not.toHaveClass(/mv-mobile-sheet--open/);
});

test('Create-order FAB is shown on the orders page and creates a draft order', async ({ page }) => {
    await page.goto('/orders');
    const fab = page.locator('.mv-fab');
    await expect(fab).toBeVisible();

    await fab.click();
    await expect(page).toHaveURL(/\/orders\/new/);
});

test('Create-order FAB is not shown on unrelated pages', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.locator('.mv-fab')).toHaveCount(0);
});

test('scroll-to-top button appears after scrolling down and scrolls back to top', async ({
    page,
}) => {
    await page.goto('/orders');
    const scrollUp = page.getByRole('button', { name: 'Scroll to top' });
    await expect(scrollUp).toBeHidden();

    await page.evaluate(() => window.scrollTo(0, 800));
    await expect(scrollUp).toBeVisible();

    await scrollUp.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(50);
});
