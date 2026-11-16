import { test, expect } from '@playwright/test';

// Customers list (#344): name suggestions inside the Filter builder, and the credit filter.
test.describe('customers list filters @on:manager-portal-admin @read-only', () => {
    test('the name filter suggests values from the caller scope and applies one as a chip', async ({
        page,
    }) => {
        await page.goto('/customers');
        await page.getByTestId('filter-trigger').click();
        await page.getByTestId('filter-column-shortName').click();

        const value = page.getByTestId('filter-value');
        await value.fill('E2E');
        const suggestions = page.getByTestId('filter-suggestion');
        await expect(suggestions.first()).toBeVisible({ timeout: 15000 });
        for (const text of await suggestions.allInnerTexts()) {
            expect(text.toLowerCase()).toContain('e2e');
        }
        expect(await suggestions.count()).toBeLessThanOrEqual(10);

        const chosen = (await suggestions.first().innerText()).trim();
        await suggestions.first().click();
        await expect(value).toHaveValue(chosen);
        await page.getByRole('button', { name: 'Apply filter' }).click();

        await expect(page.getByTestId('filter-chip')).toHaveCount(1);
        await expect(page.getByRole('row').filter({ hasText: chosen }).first()).toBeVisible();
    });

    test('a single character offers no suggestions', async ({ page }) => {
        await page.goto('/customers');
        await page.getByTestId('filter-trigger').click();
        await page.getByTestId('filter-column-shortName').click();
        await page.getByTestId('filter-value').fill('E');
        await page.waitForTimeout(800);
        await expect(page.getByTestId('filter-suggestion')).toHaveCount(0);
    });

    test('a credit limit condition shows a chip and survives a reload', async ({ page }) => {
        await page.goto('/customers');
        await page.getByTestId('filter-trigger').click();
        await page.getByTestId('filter-column-creditLimit').click();
        await page.getByTestId('filter-operator').selectOption('gt');
        await page.getByTestId('filter-value').fill('1');
        await page.getByRole('button', { name: 'Apply filter' }).click();

        await expect(page.getByTestId('filter-chip')).toHaveCount(1);
        await expect(page).toHaveURL(/filters=/);
        await page.reload();
        await expect(page.getByTestId('filter-chip')).toHaveCount(1);
    });

    test('the manager filter lists many managers behind a search box that narrows them (#377)', async ({
        page,
    }) => {
        await page.goto('/customers');
        await page.getByTestId('filter-trigger').click();
        await page.getByTestId('filter-column-manager').click();

        const trigger = page.locator(
            'button.mv-search-select__trigger[data-testid="filter-value"]',
        );
        await expect(trigger).toBeVisible({ timeout: 15000 });
        await trigger.click();
        const options = page.getByTestId('search-select-option');
        expect(await options.count()).toBeGreaterThan(8);

        await page.getByTestId('search-select-input').fill('Manager3');
        await expect(options).toHaveCount(1);
        await page.getByTestId('search-select-input').fill('no-such-manager');
        await expect(page.getByTestId('search-select-empty')).toBeVisible();

        await page.getByTestId('search-select-input').fill('Manager3');
        await options.first().click();
        await page.getByRole('button', { name: 'Apply filter' }).click();
        await expect(page.getByTestId('filter-chip')).toHaveCount(1);
    });
});
