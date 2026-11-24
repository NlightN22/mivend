import { expect, test, type Page } from '@playwright/test';

// The analytics service is a test double that answers with one row whose name is the JSON of what the
// server asked for, so these specs read the request that left the server from the table.
const CUSTOMER = { erpId: 'cnt-001', name: 'AutoService Nord' };
const PRODUCT = { erpId: 'ext-003', name: 'Oil Filter Universal' };

async function openReport(page: Page, locale: 'en' | 'ru' = 'en'): Promise<void> {
    await page.addInitScript(l => localStorage.setItem('mivend.locale', l), locale);
    await page.goto('/analytics/orders');
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

async function removeFilters(page: Page): Promise<void> {
    for (const chip of await page.getByTestId('filter-chip').all()) {
        await chip.getByRole('button', { name: /^(Remove|Убрать)/ }).click();
    }
}

test.describe('Orders analytics report @on:manager-general-director @read-only', () => {
    test('a typed customer name reaches the service as its ERP id', async ({ page }) => {
        await openReport(page);
        await addFilter(page, 'customer', CUSTOMER.name);

        await expect(
            page.getByRole('main').getByText(`"customerIds":["${CUSTOMER.erpId}"]`),
        ).toBeVisible();
    });

    test('a product name switches the table to line totals and reaches the service as its ERP id', async ({
        page,
    }) => {
        await openReport(page);
        await addFilter(page, 'product', PRODUCT.name);

        const main = page.getByRole('main');
        await expect(main.getByText(`"productIds":["${PRODUCT.erpId}"]`)).toBeVisible();
        await expect(main.getByRole('columnheader', { name: /^Quantity/ })).toBeVisible();
        await expect(main.getByRole('columnheader', { name: /^With VAT/ })).toHaveCount(0);
    });

    test('a name that matches nothing shows no rows, not the unfiltered answer', async ({
        page,
    }) => {
        await openReport(page);
        await addFilter(page, 'manufacturer', 'no such manufacturer anywhere');

        await expect(page.getByRole('main').getByText('No orders in this period.')).toBeVisible();
    });

    test('the customer manager dimension and the main-manager switch reach the service', async ({
        page,
    }) => {
        await openReport(page);
        await page.getByLabel('Break down by').selectOption('COUNTERPARTY_MANAGER');
        await page.getByRole('main').getByLabel('Main manager only').check();

        const main = page.getByRole('main');
        await expect(main.getByText(/"dimension":"DIMENSION_COUNTERPARTY_MANAGER"/)).toBeVisible();
        await expect(main.getByText(/"mainManagerOnly":true/)).toBeVisible();
    });

    test('the Filters panel suggests names, a picked suggestion applies and the chip removes it', async ({
        page,
    }) => {
        await openReport(page);
        await page.getByTestId('filter-trigger').click();
        await page.getByTestId('filter-column-customer').click();
        const panel = page.getByTestId('filter-panel');
        await panel.locator('input').pressSequentially('AutoService');
        const suggestion = page.getByTestId('filter-suggestion').filter({ hasText: CUSTOMER.name });
        await expect(suggestion).toBeVisible();
        await suggestion.click();
        // The list is open while Apply is pressed: the click must not be lost to the closing list.
        await panel.getByRole('button', { name: /^Apply filter$/ }).click();

        await expect(page.getByTestId('filter-chip')).toHaveCount(1);
        await removeFilters(page);
        await expect(page.getByTestId('filter-chip')).toHaveCount(0);
    });

    test('Apply works while the suggestion list is still open', async ({ page }) => {
        await openReport(page);
        await page.getByTestId('filter-trigger').click();
        await page.getByTestId('filter-column-customer').click();
        const panel = page.getByTestId('filter-panel');
        await panel.locator('input').pressSequentially(CUSTOMER.name);
        await expect(page.getByTestId('filter-suggestion').first()).toBeVisible();
        await panel.getByRole('button', { name: /^Apply filter$/ }).click();

        await expect(page.getByTestId('filter-chip')).toHaveCount(1);
    });

    test('the whole page, its filters and the report catalog are Russian in ru', async ({
        page,
    }) => {
        await openReport(page, 'ru');
        const main = page.getByRole('main');

        await expect(main.getByRole('heading', { level: 1, name: 'Заказы' })).toBeVisible();
        await expect(main.getByRole('button', { name: 'Последние 90 дней' })).toBeVisible();
        await expect(
            main.getByLabel('Разрез').locator('option', { hasText: 'Менеджер клиента' }),
        ).toHaveCount(1);
        await page.getByTestId('filter-trigger').click();
        await expect(page.getByTestId('filter-column-counterpartyManager')).toHaveText(
            'Менеджер клиента',
        );
        await page.getByTestId('filter-column-product').click();
        await expect(page.getByTestId('filter-panel')).toContainText('Фильтровать по Товар');
        await expect(page.getByTestId('filter-panel')).toContainText('содержит');
        await expect(page.getByTestId('filter-panel')).toContainText('Применить фильтр');

        await page.goto('/analytics');
        await expect(page.getByRole('main').getByText('Продажи', { exact: true })).toHaveCount(0);
        await expect(page.getByRole('main').getByRole('link', { name: /Заказы/ })).toBeVisible();
    });
});
