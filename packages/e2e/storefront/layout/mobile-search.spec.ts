import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });

const trigger = (page: Page) => page.locator('.mobile-search__trigger');
const overlay = (page: Page) => page.locator('.mobile-search__overlay');

async function openSearch(page: Page): Promise<void> {
    await page.goto('/');
    await trigger(page).click();
    await expect(overlay(page)).toBeVisible();
    await expect(overlay(page).locator('input')).toBeFocused();
}

test.describe('phone search overlay', () => {
    test('the keyboard search key runs the search and the overlay stays closed', async ({ page }) => {
        await openSearch(page);
        await overlay(page).locator('input').fill('oil');
        await overlay(page).locator('input').press('Enter');

        await expect(page).toHaveURL(/\/catalog\?(.*&)?q=oil/);
        await expect(overlay(page)).toHaveCount(0);
        await expect(page.getByRole('main')).toBeVisible();
        await expect(overlay(page)).toHaveCount(0);
    });

    test('the close button closes the overlay and returns focus to the magnifier', async ({ page }) => {
        await openSearch(page);
        await overlay(page).getByRole('button', { name: /close search|закрыть поиск/i }).click();

        await expect(overlay(page)).toHaveCount(0);
        await expect(trigger(page)).toBeFocused();
    });

    test('Escape closes the overlay and returns focus to the magnifier', async ({ page }) => {
        await openSearch(page);
        await page.keyboard.press('Escape');

        await expect(overlay(page)).toHaveCount(0);
        await expect(trigger(page)).toBeFocused();
    });

    test('the small cross clears the text and keeps the overlay open', async ({ page }) => {
        await openSearch(page);
        const input = overlay(page).locator('input');
        await input.fill('oil');
        await overlay(page).locator('.mv-search__clear').click();

        await expect(input).toHaveValue('');
        await expect(overlay(page)).toBeVisible();
    });
});
