import { test, expect } from '@playwright/test';

const POINT_NAME = 'E2E Trading Point';

test.describe('Editing an ERP trading point', () => {
    test('the edit waits for a manager and the point keeps its data', async ({ page }) => {
        await page.goto('/account/trading-points');
        const card = page.locator('.tp-card', { hasText: POINT_NAME }).first();
        await card.getByRole('button', { name: 'Edit' }).click();

        const nameInput = card.getByPlaceholder('e.g. North AutoService');
        await nameInput.fill(`${POINT_NAME} renamed`);
        await card.getByRole('button', { name: 'Save changes' }).click();

        const updated = page.locator('.tp-card', { hasText: POINT_NAME }).first();
        await expect(updated.getByTestId('tp-pending')).toContainText(
            'Your change waits for a manager',
        );
        await expect(updated.locator('.tp-card__name')).toHaveText(POINT_NAME);
    });
});
