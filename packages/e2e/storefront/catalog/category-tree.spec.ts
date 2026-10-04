import { test, expect } from '@playwright/test';
import {
    SLUG,
    adminToken,
    restoreCategoryTree,
    setOverride,
    waitForShopSlug,
} from '../../helpers/category-tree';
import { readSidebar, OILS_EXPECTED, MINERAL_EXPECTED } from '../../helpers/category-sidebar';

const url = (slug: string): string => `/catalog?collection=${slug}`;

test.describe('Storefront category tree (#59)', () => {
    test('sidebar renders the drill-down block for a parent and a leaf position', async ({
        page,
    }) => {
        await page.goto(url(SLUG.oils));
        const parent = await readSidebar(page);
        expect(parent.back).toEqual(OILS_EXPECTED.back);
        expect(parent.current).toBe(OILS_EXPECTED.current);
        expect(new Set(parent.level)).toEqual(new Set(OILS_EXPECTED.level));

        await page.goto(url(SLUG.mineral));
        const leaf = await readSidebar(page);
        expect(leaf.back).toEqual(MINERAL_EXPECTED.back);
        expect(leaf.current).toBe(MINERAL_EXPECTED.current);
        expect(new Set(leaf.level)).toEqual(new Set(MINERAL_EXPECTED.level));
    });

    test.describe('hidden category', () => {
        let token: string;

        test.beforeAll(async () => {
            token = await adminToken();
        });

        test.afterEach(async () => {
            await restoreCategoryTree(token);
        });

        test('hides a parent with its descendants everywhere; visible override child stays reachable', async ({
            page,
        }) => {
            await setOverride(token, SLUG.oils, 'hidden');
            await setOverride(token, SLUG.mineral, 'visible');
            await waitForShopSlug(SLUG.oils, false);
            await waitForShopSlug(SLUG.synthetic, false);
            await waitForShopSlug(SLUG.mineral, true);

            await page.goto('/catalog');
            await page.locator('.app-header__catalog-btn').click();
            await page.locator('.mv-catalog-dropdown__cat', { hasText: 'Engine' }).first().hover();
            const dropdown = page.locator('.mv-catalog-dropdown');
            await expect(dropdown).not.toContainText('Synthetic Oils');
            await expect(dropdown).not.toContainText('Semi-Synthetic Oils');
            await expect(dropdown).not.toContainText('Engine Oils');

            const errors: string[] = [];
            page.on('pageerror', e => errors.push(e.message));

            await page.goto(url(SLUG.engine));
            const sidebar = await readSidebar(page);
            expect(sidebar.level).not.toContain('Engine Oils');
            expect(sidebar.level).not.toContain('Synthetic Oils');

            for (const slug of [SLUG.oils, SLUG.synthetic]) {
                await page.goto(url(slug));
                await expect(page.locator('.catalog-page')).toBeVisible();
                await expect(page.locator('.mv-category-nav')).not.toContainText('Synthetic Oils');
            }

            await page.goto(url(SLUG.mineral));
            await expect(page.locator('.catalog-page__heading')).toHaveText('Mineral Oils');
            const crumbs = page.locator('.mv-breadcrumbs');
            await expect(crumbs).toContainText('Engine');
            await expect(crumbs).not.toContainText('Engine Oils');
            expect(errors).toEqual([]);

            await restoreCategoryTree(token);
            await waitForShopSlug(SLUG.oils, true);
            await waitForShopSlug(SLUG.synthetic, true);
            await page.goto(url(SLUG.oils));
            const restored = await readSidebar(page);
            expect(restored.back).toEqual(OILS_EXPECTED.back);
            expect(new Set(restored.level)).toEqual(new Set(OILS_EXPECTED.level));
        });
    });
});
