import { test, expect } from '@playwright/test';

const POINT_NAME = 'E2E Pending Point';

test.describe('Editing an ERP trading point', () => {
    test('the edit waits for a manager and the point keeps its data', async ({ page }) => {
        await page.goto('/account/trading-points');
        const card = page.locator('.tp-card', { hasText: POINT_NAME }).first();
        await card.getByRole('button', { name: 'Edit' }).click();

        // The edit form replaces the card, so it is found on the page, not inside the card.
        const nameInput = page.getByPlaceholder('e.g. North AutoService');
        await nameInput.fill(`${POINT_NAME} renamed`);
        await page.getByRole('button', { name: 'Save changes' }).click();

        const updated = page.locator('.tp-card', { hasText: POINT_NAME }).first();
        await expect(updated.getByTestId('tp-pending')).toContainText(
            'Your change waits for a manager',
        );
        await expect(updated.locator('.tp-card__name')).toHaveText(POINT_NAME);
    });
});
