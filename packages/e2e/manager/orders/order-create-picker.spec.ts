import { test, expect } from '@playwright/test';
import { PICKER_NO_PORTAL, PICKER_TARGET } from '../../fixtures/seed-picker';

const SEARCH_PLACEHOLDER = 'Search by company name or INN...';

test('new order: a counterparty beyond the first 500 is found by typing its name', async ({
    page,
}) => {
    await page.goto('/orders/new');
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill(PICKER_TARGET.shortName);

    const result = page.getByRole('listitem').filter({ hasText: PICKER_TARGET.shortName });
    await expect(result).toBeVisible({ timeout: 15000 });
    await expect(result).not.toContainText('Portal access not activated');
});

test('new order: a counterparty without a portal customer shows the reason and is not selectable', async ({
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
