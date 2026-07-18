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

test('More sheet items actually navigate, not just close the sheet', async ({ page }) => {
    await page.goto('/');
    await page.locator('.mv-app-mobile-nav').getByRole('button', { name: 'More' }).click();

    const sheet = page.locator('.mv-mobile-sheet');
    await sheet.getByRole('link', { name: 'Catalog' }).click();

    await expect(page).toHaveURL(/\/catalog/);
    await expect(sheet).not.toHaveClass(/mv-mobile-sheet--open/);
});

test('bottom nav highlights the correct item on a nested route', async ({ page }) => {
    await page.goto('/orders');
    const ordersLink = page.locator('.mv-app-mobile-nav').getByRole('link', { name: 'Orders' });
    await expect(ordersLink).toHaveClass(/mv-app-mobile-nav__item--active/);

    await page.goto('/customers');
    await expect(ordersLink).not.toHaveClass(/mv-app-mobile-nav__item--active/);
    await expect(
        page.locator('.mv-app-mobile-nav').getByRole('link', { name: 'Customers' }),
    ).toHaveClass(/mv-app-mobile-nav__item--active/);
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

test('bottom nav "More" tab shows active on a page reached only via the sheet', async ({
    page,
}) => {
    await page.goto('/discounts');
    await expect(
        page.locator('.mv-app-mobile-nav').getByRole('button', { name: 'More' }),
    ).toHaveClass(/mv-app-mobile-nav__item--active/);

    await page.locator('.mv-app-mobile-nav').getByRole('button', { name: 'More' }).click();
    await expect(
        page.locator('.mv-mobile-sheet').getByRole('link', { name: 'Discounts' }),
    ).toHaveClass(/mv-mobile-sheet__item--active/);
});

test('orders page has no horizontal overflow at a narrow mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 690 });
    await page.goto('/orders');
    await expect(page.locator('.mv-app-mobile-nav')).toBeVisible();
    const overflowing = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflowing).toBe(false);
});

test('bottom nav and FAB are hidden on desktop/tablet, sidebar shows instead', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/orders');
    await expect(page.locator('.mv-app-sidebar')).toBeVisible();
    await expect(page.locator('.mv-app-mobile-nav')).toBeHidden();
    await expect(page.locator('.mv-fab')).toBeHidden();
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
