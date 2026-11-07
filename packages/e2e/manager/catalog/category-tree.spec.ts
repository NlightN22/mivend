import { test, expect } from '@playwright/test';
import { SLUG, adminToken, restoreCategoryTree, setOverride } from '../../helpers/category-tree';

test.describe('Manager category tree (#59)', () => {
    test.describe('visibility page', () => {
        let token: string;

        test.beforeAll(async () => {
            token = await adminToken();
        });

        test.afterEach(async () => {
            await restoreCategoryTree(token);
        });

        test('shows the hidden reason per category, then restores the tree @on:manager-portal-admin', async ({
            page,
        }) => {
            await setOverride(token, SLUG.oils, 'hidden');

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
            expect(mineral).toContain('Hidden ancestor');

            await restoreCategoryTree(token);
            await expect(async () => {
                await page.goto('/settings/category-visibility');
                expect(await rowReason('Engine Oils', SLUG.oils)).not.toContain('Manual override');
            }).toPass({ timeout: 30_000 });
        });
    });
});
