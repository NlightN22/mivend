import { test, expect } from '@playwright/test';

const ROWS = '.mv-advanced-data-table__grid tbody tr';

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mivend.locale', 'ru'));
});

test('the ERP discounts list reads in Russian: headers, singular row status, day-first dates @on:manager-portal-admin @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/discounts');
    await expect(page.locator(ROWS).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Скидки' })).toBeVisible();
    for (const name of ['Скидка №', 'Начало', 'Клиент', 'Конец', 'Статус'])
        await expect(page.getByRole('columnheader', { name })).toBeVisible();
    await expect(page.locator(ROWS).getByText('Действует', { exact: true }).first()).toBeVisible();
    await expect(page.locator(ROWS).first()).toContainText(/\d{2}\.\d{2}\.\d{4}/);
});

test('the requests side of the discounts page reads in Russian @on:manager-portal-admin @read-only', async ({
    page,
}) => {
    await page.goto('/discounts');
    await page
        .getByRole('button', { name: 'Заявки' })
        .or(page.getByRole('tab', { name: 'Заявки' }))
        .click();
    await expect(page.getByPlaceholder('Номер или клиент…')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Статус' })).toBeVisible();
});
