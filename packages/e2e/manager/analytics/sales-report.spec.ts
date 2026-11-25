import { expect, test, type Page } from '@playwright/test';

// The analytics service is a test double that answers with one row whose name is the JSON of what the
// server asked for, so these specs read the request that left the server from the table.
const CUSTOMER = { erpId: 'cnt-001', name: 'AutoService Nord' };

async function openReport(page: Page, locale: 'en' | 'ru' = 'en'): Promise<void> {
    await page.addInitScript(l => localStorage.setItem('mivend.locale', l), locale);
    await page.goto('/analytics/sales');
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
}

async function addFilter(page: Page, column: string, text: string): Promise<void> {
    await page.getByTestId('filter-trigger').click();
    await page.getByTestId(`filter-column-${column}`).click();
    const panel = page.getByTestId('filter-panel');
    await panel.locator('input').fill(text);
    await panel.getByRole('button', { name: /^(Apply filter|Применить фильтр)$/ }).click();
    await expect(page.getByTestId('filter-chip')).toHaveCount(1);
}

test.describe('Sales analytics report @on:manager-general-director @read-only', () => {
    test('the report says the figures are preliminary and offers only the sales filters', async ({
        page,
    }) => {
        await openReport(page);
        const main = page.getByRole('main');

        await expect(main.getByTestId('sales-preliminary')).toContainText('Preliminary data');
        await page.getByTestId('filter-trigger').click();
        for (const column of ['customer', 'organization', 'contract', 'counterpartyManager']) {
            await expect(page.getByTestId(`filter-column-${column}`)).toBeVisible();
        }
        await expect(page.getByTestId('filter-column-product')).toHaveCount(0);
    });

    test('a typed customer name reaches the service as its ERP id', async ({ page }) => {
        await openReport(page);
        await addFilter(page, 'customer', CUSTOMER.name);

        await expect(
            page.getByRole('main').getByText(`"counterpartyIds":["${CUSTOMER.erpId}"]`),
        ).toBeVisible();
    });

    test('a contract name that matches nothing shows no rows, not the unfiltered answer', async ({
        page,
    }) => {
        await openReport(page);
        await addFilter(page, 'contract', 'no such contract anywhere');

        await expect(page.getByRole('main').getByText('No sales in this period.')).toBeVisible();
    });

    test('the dimension, granularity and main-manager switch reach the service', async ({
        page,
    }) => {
        await openReport(page);
        await page.getByLabel('Break down by').selectOption('COUNTERPARTY_MANAGER');
        await page.getByLabel('Group by period').selectOption('DAY');
        await page.getByRole('main').getByLabel('Main manager only').check();

        const main = page.getByRole('main');
        await expect(
            main.getByText(/"dimension":"SALES_DIMENSION_COUNTERPARTY_MANAGER"/),
        ).toBeVisible();
        await expect(main.getByText(/"granularity":"GRANULARITY_DAY"/)).toBeVisible();
        await expect(main.getByText(/"mainManagerOnly":true/)).toBeVisible();
        await expect(main.getByRole('columnheader', { name: /^Currency/ })).toBeVisible();
    });

    test('the whole page, its filters and the notices are Russian in ru', async ({ page }) => {
        await openReport(page, 'ru');
        const main = page.getByRole('main');

        await expect(main.getByRole('heading', { level: 1, name: 'Продажи' })).toBeVisible();
        await expect(main.getByTestId('sales-preliminary')).toContainText('Предварительные данные');
        await expect(
            main.getByLabel('Разрез').locator('option', { hasText: 'Договор' }),
        ).toHaveCount(1);
        await expect(main.getByRole('columnheader', { name: /^Валюта/ })).toBeVisible();
        await page.getByTestId('filter-trigger').click();
        await expect(page.getByTestId('filter-column-contract')).toHaveText('Договор');
        await page.getByTestId('filter-column-contract').click();
        await expect(page.getByTestId('filter-panel')).toContainText('Применить фильтр');
    });
});
