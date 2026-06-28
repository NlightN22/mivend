import { test, expect } from '@playwright/test';

// Search tests require Elasticsearch. Skip if ES is unavailable in the current environment.
const esAvailable = async (): Promise<boolean> => {
    try {
        const res = await fetch(
            process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200/_cluster/health',
        );
        return res.ok;
    } catch {
        return false;
    }
};

const SEARCH_PLACEHOLDER = 'Article, VIN, brand, name or OEM';

test.describe('Catalog search', () => {
    test.beforeEach(async ({ page }) => {
        if (!(await esAvailable())) {
            test.skip();
        }
        await page.goto('/catalog');
        await page.waitForLoadState('networkidle');
    });

    test('search by SKU returns matching product', async ({ page }) => {
        const searchInput = page.getByPlaceholder(SEARCH_PLACEHOLDER);
        await searchInput.fill('E2E-OIL-001');
        await searchInput.press('Enter');

        await page.waitForLoadState('networkidle');
        await expect(page.getByText('Engine Oil 5W-30')).toBeVisible({ timeout: 10000 });
    });

    test('search by OEM code returns matching product', async ({ page }) => {
        const searchInput = page.getByPlaceholder(SEARCH_PLACEHOLDER);
        await searchInput.fill('15400-RTA-003');
        await searchInput.press('Enter');

        await page.waitForLoadState('networkidle');
        await expect(page.getByText('Engine Oil 5W-30')).toBeVisible({ timeout: 10000 });
    });

    test('clearing search term restores full catalog', async ({ page }) => {
        const searchInput = page.getByPlaceholder(SEARCH_PLACEHOLDER);
        await searchInput.fill('E2E-OIL-001');
        await searchInput.press('Enter');
        await page.waitForLoadState('networkidle');

        await searchInput.clear();
        await searchInput.press('Enter');
        await page.waitForLoadState('networkidle');

        const url = new URL(page.url());
        expect(url.searchParams.get('q') ?? '').toBe('');
    });
});
