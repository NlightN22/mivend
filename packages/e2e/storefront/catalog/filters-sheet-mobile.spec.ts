import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('phone filters sheet: opens, traps focus, applies a filter, closes and restores focus', async ({
    page,
}) => {
    await page.goto('/catalog');
    await page.waitForLoadState('networkidle');

    const opener = page.locator('.plv-toolbar__filters');
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeHidden();
    await opener.click();
    await expect(sheet).toBeVisible();
    await expect(sheet.locator(':focus')).toHaveCount(1);

    for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
    await expect(sheet.locator(':focus')).toHaveCount(1);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    await sheet.locator('input[type="checkbox"]').first().check();
    await expect(page.locator('.plv-toolbar__filters-badge')).toHaveText('1', {
        useInnerText: true,
    });
    await sheet.locator('.mv-filter-sheet__apply').click();

    await expect(sheet).toBeHidden();
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    await expect(page.locator('.plv-toolbar__filters-badge')).toHaveText('1');
});

test('phone filters sheet: Escape closes it', async ({ page }) => {
    await page.goto('/catalog');
    await page.waitForLoadState('networkidle');
    await page.locator('.plv-toolbar__filters').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
});
