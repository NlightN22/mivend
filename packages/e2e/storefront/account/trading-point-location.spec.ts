import { test, expect, type Page } from '@playwright/test';

const POINT_NAME = 'E2E Picker Point';
const CENTRE = { latitude: 12.5, longitude: 12.5 };
const ONE_PIXEL_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
);

async function stubGeo(page: Page): Promise<void> {
    await page.route('**/tile.openstreetmap.org/**', route =>
        route.fulfill({ contentType: 'image/png', body: ONE_PIXEL_PNG }),
    );
    await page.route('**/shop-api', async route => {
        const body = route.request().postData() ?? '';
        const reply = (data: unknown): Promise<void> =>
            route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('query GeoConfig')) {
            return reply({
                geoConfig: {
                    providers: [{ key: 'open', publicKey: null }],
                    defaultProvider: 'open',
                    defaultLatitude: 20.0,
                    defaultLongitude: 20.0,
                    defaultZoom: 5,
                },
            });
        }
        if (body.includes('query SearchAddress')) {
            return reply({ searchAddress: [{ address: 'Main street 12', ...CENTRE }] });
        }
        if (body.includes('query ReverseGeocode')) {
            return reply({ reverseGeocode: 'Stub street 1, Stub city' });
        }
        return route.continue();
    });
}

async function removeCreatedPoints(page: Page): Promise<void> {
    const call = async (query: string, variables?: object): Promise<Record<string, unknown>> => {
        const response = await page.request.post('/shop-api', { data: { query, variables } });
        return ((await response.json()) as { data: Record<string, unknown> }).data;
    };
    const data = await call('{ myTradingPoints { id name customerOwned } }');
    const points = data.myTradingPoints as { id: string; name: string }[];
    for (const point of points.filter(p => p.name === POINT_NAME)) {
        await call('mutation($id:ID!){ customerDeleteTradingPoint(id:$id) }', { id: point.id });
    }
}

test.describe('Trading point location picker', () => {
    test.afterEach(async ({ page }) => {
        await removeCreatedPoints(page);
    });

    test('a point is saved only after a location is picked on the map', async ({ page }) => {
        await stubGeo(page);
        await page.goto('/account/trading-points');
        await page.getByRole('button', { name: '+ Add point' }).click();

        const form = page.locator('.tp-add-card');
        await form.getByPlaceholder('e.g. North AutoService').fill(POINT_NAME);
        await form.getByPlaceholder('Full address').fill('Main street 12, office 3');
        const submit = form.getByRole('button', { name: 'Add point' });
        await expect(submit).toBeDisabled();
        await expect(form.getByTestId('tp-location')).toContainText('Not set');

        await form.getByRole('button', { name: 'Pick on map' }).click();
        const dialog = page.getByRole('dialog', { name: 'Pick location on map' });
        await expect(dialog).toBeVisible();
        const map = dialog.locator('.mv-loc__map');
        await expect(dialog.locator('.leaflet-container')).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Use this location' })).toBeDisabled();

        await map.click();
        await expect(dialog.getByText('Stub street 1, Stub city')).toBeVisible();
        await dialog.getByRole('button', { name: 'Use this location' }).click();
        await expect(dialog).toBeHidden();

        await expect(form.getByTestId('tp-location')).not.toContainText('Not set');
        await expect(submit).toBeEnabled();
        const request = page.waitForRequest(
            r => r.method() === 'POST' && (r.postData() ?? '').includes('customerAddTradingPoint'),
        );
        await submit.click();
        const variables = (
            JSON.parse((await request).postData() ?? '{}') as {
                variables: { latitude: number; longitude: number };
            }
        ).variables;
        expect(Math.abs(variables.latitude - CENTRE.latitude)).toBeLessThan(1);
        expect(Math.abs(variables.longitude - CENTRE.longitude)).toBeLessThan(1);
        await expect(page.locator('.tp-card__name', { hasText: POINT_NAME })).toBeVisible();
    });
});
