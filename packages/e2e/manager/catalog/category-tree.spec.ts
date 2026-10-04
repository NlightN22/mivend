import { test, expect } from '@playwright/test';
import { SLUG, adminToken, restoreCategoryTree, setOverride } from '../../helpers/category-tree';
import { readSidebar, OILS_EXPECTED, MINERAL_EXPECTED } from '../../helpers/category-sidebar';

const url = (slug: string): string => `/catalog?collection=${slug}`;

test.describe('Manager category tree (#59)', () => {
    test('catalog sidebar matches the storefront block for the same positions', async ({
        page,
    }, testInfo) => {
        test.skip(testInfo.project.name !== 'manager-operator', 'Display parity runs once');

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

    test.describe('visibility page', () => {
        let token: string;

        test.beforeAll(async () => {
            token = await adminToken();
        });

        test.afterEach(async () => {
            await restoreCategoryTree(token);
        });

        test('shows the hidden reason per category, then restores the tree', async ({
            page,
        }, testInfo) => {
            test.skip(testInfo.project.name !== 'manager-portal-admin', 'Needs UpdateCatalog');
            await setOverride(token, SLUG.oils, 'hidden');
            await setOverride(token, SLUG.mineral, 'visible');

            const rowReason = async (name: string, slug: string): Promise<string> => {
                await page.getByPlaceholder('Search categories…').fill(name);
                const row = page
                    .getByRole('row')
                    .filter({ has: page.getByText(slug, { exact: true }) });
                await expect(row).toBeVisible();
                return (await row.innerText()).replace(/\s+/g, ' ');
            };

            await expect(async () => {
                await page.goto('/settings/category-visibility');
                expect(await rowReason('Synthetic Oils', SLUG.synthetic)).toContain(
                    'Hidden ancestor',
                );
            }).toPass({ timeout: 30_000 });
            expect(await rowReason('Engine Oils', SLUG.oils)).toContain('Manual override');
            const mineral = await rowReason('Mineral Oils', SLUG.mineral);
            expect(mineral).toContain('Visible');
            expect(mineral).not.toMatch(/Hidden ancestor|Own feed|Manual override/);

            await restoreCategoryTree(token);
            await page.goto(url(SLUG.oils));
            expect((await readSidebar(page)).level).toEqual(OILS_EXPECTED.level);
        });
    });
});
