import { test, expect, type Page } from '@playwright/test';
import { SEED_LOCATION } from '../../fixtures/seed-location';

// Issue #339: the change journal UI. The entry comes from a real product mutation, never SQL.
async function adminApiViaPage<T>(
    page: Page,
    query: string,
    variables?: Record<string, unknown>,
): Promise<T> {
    const res = await page.request.post('/admin-api', { data: { query, variables } });
    const json = (await res.json()) as { data: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '));
    return json.data;
}

async function seededPointId(page: Page): Promise<string> {
    const data = await adminApiViaPage<{
        counterparties: { items: { tradingPoints: { id: string; erpId: string }[] }[] };
    }>(
        page,
        `query { counterparties(options: { take: 200 }) { items { tradingPoints { id erpId } } } }`,
    );
    const tp = data.counterparties.items
        .flatMap(c => c.tradingPoints)
        .find(t => t.erpId === 'e2e-tp-001');
    if (!tp) throw new Error('e2e-tp-001 not found');
    return tp.id;
}

const UPDATE_POINT = `mutation($id: ID!, $input: TradingPointDetailsInput!) { updateTradingPointDetails(id: $id, input: $input) { id } }`;

async function openE2eCustomerDetail(page: Page): Promise<void> {
    await page.goto('/customers?search=E2E%20Co');
    const row = page.locator('.el-table-v2__row', { hasText: 'E2E Co' });
    await row.waitFor({ timeout: 15000 });
    await row.click({ position: { x: 20, y: 10 } });
    await expect(page).toHaveURL(/\/customers\/.+/);
}

test('a trading point edit shows up in its Журнал изменений and in the journal page @on:manager-portal-admin', async ({
    page,
}) => {
    await page.goto('/');
    const pointId = await seededPointId(page);
    const moved = { latitude: SEED_LOCATION.latitude + 0.5, longitude: SEED_LOCATION.longitude };
    try {
        await adminApiViaPage(page, UPDATE_POINT, { id: pointId, input: moved });

        await openE2eCustomerDetail(page);
        await page
            .locator('li', { hasText: 'E2E Trading Point' })
            .getByRole('button', { name: 'Журнал изменений' })
            .click();
        const modal = page.getByRole('dialog');
        const latest = modal.getByTestId('change-journal').getByRole('listitem').first();
        await expect(latest).toContainText('Изменение', { timeout: 15000 });
        await expect(latest).toContainText('Администратор:');
        await expect(latest.getByRole('row', { name: /latitude/ })).toContainText(/10\.50*/);
        await modal.getByRole('button', { name: 'Close' }).click();

        await page.goto('/settings/change-journal?entityType=TradingPoint');
        await expect(page.getByRole('heading', { name: 'Журнал изменений' })).toBeVisible();
        await expect(
            page.getByTestId('change-journal').getByRole('listitem').first(),
        ).toContainText(`Торговая точка #${pointId}`, { timeout: 15000 });
    } finally {
        await adminApiViaPage(page, UPDATE_POINT, { id: pointId, input: SEED_LOCATION });
    }
});

test('Журнал изменений and the journal page are hidden without ReadChangeJournal (negative) @on:manager-operator @read-only', async ({
    page,
}) => {
    await openE2eCustomerDetail(page);
    await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Журнал изменений' })).toHaveCount(0);

    await page.goto('/settings/change-journal');
    await expect(page).not.toHaveURL(/change-journal/);
});

test('the journal page shows an access error to a role without access to all customers @on:manager-department-head @read-only', async ({
    page,
}) => {
    await page.goto('/settings/change-journal');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Нет прав на эту историю', { timeout: 15000 });
});
