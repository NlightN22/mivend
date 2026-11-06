import { test, expect } from '@playwright/test';
import { PICKER_NO_PORTAL, PICKER_TARGET } from '../../fixtures/seed-picker';

const SEARCH_PLACEHOLDER = 'Search by company name or INN...';

test('new order: a counterparty beyond the first 500 is found by typing its name @on:manager-operator @on:manager-manager @read-only', async ({
    page,
}) => {
    await page.goto('/orders/new');
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill(PICKER_TARGET.shortName);

    const result = page.getByRole('listitem').filter({ hasText: PICKER_TARGET.shortName });
    await expect(result).toBeVisible({ timeout: 15000 });
    await expect(result).not.toContainText('Portal access not activated');
});

test('new order: a counterparty without a portal customer shows the reason and is not selectable @on:manager-operator @on:manager-manager @read-only', async ({
    page,
}) => {
    await page.goto('/orders/new');
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill(PICKER_NO_PORTAL.shortName);

    const result = page.getByRole('listitem').filter({ hasText: PICKER_NO_PORTAL.shortName });
    await expect(result).toContainText('Portal access not activated', { timeout: 15000 });
    await expect(result).toHaveAttribute('aria-disabled', 'true');

    await result.click();
    await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Change customer' })).toHaveCount(0);
});

test('new order: picking a customer opens the storefront acting route in a new tab @on:manager-operator @on:manager-manager', async ({
    page,
    context,
}) => {
    await page.goto('/orders/new');
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill(PICKER_TARGET.shortName);
    await page
        .getByRole('listitem')
        .filter({ hasText: PICKER_TARGET.shortName })
        .click({ timeout: 15000 });

    const popupPromise = context.waitForEvent('page');
    await page.getByRole('button', { name: 'Open storefront' }).click();
    const popup = await popupPromise;
    await popup.waitForURL(/\/acting#ticket=[^&]+/, { timeout: 15000 });
    await popup.close();
});
