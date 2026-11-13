import { test, expect } from '@playwright/test';

const ROWS = '.mv-advanced-data-table__grid tbody tr';

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mivend.locale', 'ru'));
});

test('the proforma invoices list reads in Russian: breadcrumb, headers, status, day-first dates @on:manager-portal-admin @read-only', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/proforma-invoices');
    await expect(page.locator(ROWS).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Рабочее пространство / Счета на оплату')).toBeVisible();
    for (const name of ['Счёт №', 'Дата', 'Клиент', 'Заказ', 'Статус', 'Сумма', 'Срок'])
        await expect(page.getByRole('columnheader', { name })).toBeVisible();
    await expect(
        page.locator(ROWS).getByText('Действующий', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.locator(ROWS).first()).toContainText(/\d{2}\.\d{2}\.\d{4}/);
});
