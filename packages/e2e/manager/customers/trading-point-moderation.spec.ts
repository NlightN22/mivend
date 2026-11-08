import { test, expect, type Page } from '@playwright/test';
import { E2E_CUSTOMER } from '../../fixtures/seed';
import { SEED_LOCATION } from '../../fixtures/seed-location';
import { shopGql, shopLoginCookie } from '../../helpers/api';

const POINT_ERP_ID = 'e2e-tp-002';
const POINT_NAME = 'E2E North Depot';
const POINT_ADDRESS = 'North Ave 42';
const PROPOSED_NAME = 'E2E North Depot (moderated)';

async function adminApi<T>(
    page: Page,
    query: string,
    variables?: Record<string, unknown>,
): Promise<T> {
    const res = await page.request.post('/admin-api', { data: { query, variables } });
    const json = (await res.json()) as { data: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '));
    return json.data;
}

async function pointId(page: Page): Promise<string> {
    const data = await adminApi<{
        counterparties: { items: { tradingPoints: { id: string; erpId: string }[] }[] };
    }>(
        page,
        `query { counterparties(options: { take: 200 }) { items { tradingPoints { id erpId } } } }`,
    );
    const tp = data.counterparties.items
        .flatMap(c => c.tradingPoints)
        .find(t => t.erpId === POINT_ERP_ID);
    if (!tp) throw new Error(`${POINT_ERP_ID} not found`);
    return tp.id;
}

async function customerProposesRename(id: string): Promise<void> {
    const cookie = await shopLoginCookie(E2E_CUSTOMER.email, E2E_CUSTOMER.password);
    await shopGql(
        `mutation($id: ID!, $name: String!, $address: String!, $latitude: Float, $longitude: Float) {
            customerEditTradingPoint(id: $id, name: $name, address: $address, latitude: $latitude, longitude: $longitude) { id }
        }`,
        { id, name: PROPOSED_NAME, address: POINT_ADDRESS, ...SEED_LOCATION },
        cookie,
    );
}

async function openCustomer(page: Page): Promise<void> {
    await page.goto('/customers');
    const row = page.locator('.el-table-v2__row', { hasText: 'E2E Co' });
    await row.waitFor({ timeout: 15000 });
    await row.click({ position: { x: 20, y: 10 } });
    await expect(page).toHaveURL(/\/customers\/.+/);
}

test.describe('Trading point moderation', () => {
    let id: string;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        id = await pointId(page);
    });

    test.afterEach(async ({ page }) => {
        const pending = await adminApi<{
            pendingTradingPointChanges: { id: string; tradingPointId: string }[];
        }>(page, `query { pendingTradingPointChanges { id tradingPointId } }`);
        for (const change of pending.pendingTradingPointChanges.filter(
            c => c.tradingPointId === id,
        )) {
            await adminApi(
                page,
                `mutation($id: ID!) { rejectTradingPointChange(id: $id) { id } }`,
                {
                    id: change.id,
                },
            );
        }
        await adminApi(
            page,
            `mutation($id: ID!, $input: TradingPointDetailsInput!) { updateTradingPointDetails(id: $id, input: $input) { id } }`,
            { id, input: { name: POINT_NAME, address: POINT_ADDRESS, ...SEED_LOCATION } },
        );
    });

    test('a customer edit of an ERP point waits and a rejection leaves the point untouched @on:manager-department-head', async ({
        page,
    }) => {
        await customerProposesRename(id);
        await openCustomer(page);

        const item = page.locator('li', { hasText: POINT_NAME });
        const pending = item.getByTestId('tp-pending-change');
        await expect(pending).toContainText(PROPOSED_NAME);
        await pending.getByTestId('tp-pending-reject').click();
        await expect(pending).toBeHidden({ timeout: 15000 });
        await expect(page.locator('li', { hasText: PROPOSED_NAME })).toHaveCount(0);
        await expect(item.getByText(POINT_NAME, { exact: true })).toBeVisible();
    });

    test('accepting the change applies it to the point @on:manager-department-head', async ({
        page,
    }) => {
        await customerProposesRename(id);
        await openCustomer(page);

        const pending = page
            .locator('li', { hasText: POINT_NAME })
            .getByTestId('tp-pending-change');
        await pending.getByTestId('tp-pending-accept').click();
        await expect(
            page
                .locator('li', { hasText: PROPOSED_NAME })
                .getByText(PROPOSED_NAME, { exact: true }),
        ).toBeVisible({
            timeout: 15000,
        });
        await expect(page.getByTestId('tp-pending-change')).toHaveCount(0);
    });
});
