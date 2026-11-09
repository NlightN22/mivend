import { test, expect, type Page } from '@playwright/test';
import { SEED_LOCATION, SEED_LOCATION_TEXT } from '../../fixtures/seed-location';

const CENTER = { latitude: 10.01, longitude: 10.02 };
const ONE_PIXEL_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
);

async function stubGeo(page: Page): Promise<void> {
    await page.route('https://tile.openstreetmap.org/**', route =>
        route.fulfill({ contentType: 'image/png', body: ONE_PIXEL_PNG }),
    );
    await page.route('**/admin-api', async route => {
        const body = route.request().postDataJSON() as { query?: string } | null;
        const data: Record<string, unknown> | null = body?.query?.includes('geoConfig')
            ? {
                  geoConfig: {
                      providers: [{ key: 'open', publicKey: null }],
                      defaultProvider: 'open',
                      defaultLatitude: CENTER.latitude,
                      defaultLongitude: CENTER.longitude,
                      defaultZoom: 12,
                  },
              }
            : body?.query?.includes('searchAddress')
              ? { searchAddress: [] }
              : body?.query?.includes('reverseGeocode')
                ? { reverseGeocode: 'Stubbed Street 1' }
                : null;
        if (!data) return route.fallback();
        return route.fulfill({ json: { data } });
    });
}

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

async function seededPoint(page: Page): Promise<{ id: string; latitude: number | null }> {
    const data = await adminApiViaPage<{
        counterparties: {
            items: { tradingPoints: { id: string; erpId: string; latitude: number | null }[] }[];
        };
    }>(
        page,
        `query { counterparties(options: { take: 200 }) { items { tradingPoints { id erpId latitude } } } }`,
    );
    const tp = data.counterparties.items
        .flatMap(c => c.tradingPoints)
        .find(t => t.erpId === 'e2e-tp-001');
    if (!tp) throw new Error('e2e-tp-001 not found');
    return tp;
}

test('a manager picks a trading point location on the map and it is saved @on:manager-department-head', async ({
    page,
}) => {
    await stubGeo(page);
    await page.goto('/customers?search=E2E%20Co');
    const customerRow = page.locator('.el-table-v2__row', { hasText: 'E2E Co' });
    await customerRow.waitFor({ timeout: 15000 });
    await customerRow.click({ position: { x: 20, y: 10 } });
    await expect(page).toHaveURL(/\/customers\/.+/);

    const point = await seededPoint(page);
    try {
        await page
            .locator('li', { hasText: 'E2E Trading Point' })
            .getByRole('button', { name: 'Edit' })
            .click();
        const form = page.locator('.tp-edit-form');
        await expect(form.getByTestId('tp-location')).toContainText(SEED_LOCATION_TEXT);

        await form.getByTestId('tp-pick-on-map').click();
        const picker = page.getByRole('dialog', { name: 'Pick location on map' });
        const map = picker.locator('.mv-loc__map .leaflet-container');
        await expect(map).toBeVisible({ timeout: 15000 });
        await map.click({ position: { x: 120, y: 90 } });
        await expect(picker.getByText('Stubbed Street 1')).toBeVisible({ timeout: 10000 });
        await picker.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(picker).toBeHidden();

        await expect(form.getByTestId('tp-location')).not.toContainText(SEED_LOCATION_TEXT);
        await form.getByRole('button', { name: 'Save changes' }).click();
        await expect(form).toBeHidden({ timeout: 15000 });

        const saved = await seededPoint(page);
        expect(saved.latitude).not.toBeNull();
        expect(saved.latitude).not.toBe(SEED_LOCATION.latitude);
    } finally {
        await adminApiViaPage(
            page,
            `mutation($id: ID!, $input: TradingPointDetailsInput!) { updateTradingPointDetails(id: $id, input: $input) { id } }`,
            { id: point.id, input: SEED_LOCATION },
        );
    }
});
