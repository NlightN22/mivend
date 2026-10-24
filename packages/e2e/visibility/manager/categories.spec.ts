import { expect, test, type Page } from '@playwright/test';
import { SUPERADMIN } from '../../fixtures/accounts';
import {
    categorySku,
    categorySlug,
    restoreCategoryPlan,
} from '../../fixtures/visibility/categories';
import { shopSlugs, waitForShopSlug } from '../../helpers/category-tree';
import { loginAsManager } from '../../helpers/manager-auth';
import { E2E_BROWSER_USER_AGENT } from '../../helpers/user-agent';
import { catalogUrl, nameOf } from '../categories';
import { openManagerAs, shot, superadminToken, type Session } from '../session';

const MARKER = '[data-testid="category-hidden-marker"]';
const SETTINGS = '/settings/category-visibility';
let token: string;

test.setTimeout(90_000);

test.beforeAll(async () => {
    token = await superadminToken();
});

test.afterEach(async () => {
    await restoreCategoryPlan(token);
});

async function openSuperadmin(browser: import('@playwright/test').Browser): Promise<Session> {
    const context = await browser.newContext({
        baseURL: process.env.MANAGER_URL ?? 'http://localhost:5174',
        storageState: undefined,
        userAgent: E2E_BROWSER_USER_AGENT,
    });
    const page = await context.newPage();
    await loginAsManager(page, SUPERADMIN.identifier, SUPERADMIN.password);
    return { context, page, bodies: [] };
}

const row = (page: Page, erpId: string) =>
    page.getByRole('row').filter({ has: page.getByText(`cat-${erpId}`, { exact: true }) });

async function search(page: Page, erpId: string): Promise<void> {
    await page.getByPlaceholder('Search categories…').fill(nameOf(erpId));
}

test.describe('15: category visibility, manager portal', () => {
    test('marks hidden categories, leaves visible ones unmarked and keeps hidden ones navigable', async ({
        browser,
    }) => {
        const s = await openManagerAs(browser, 'operator-a');
        try {
            const { page } = s;
            await page.goto(catalogUrl('vis-a'));
            const nav = page.locator('.mv-category-nav');
            await expect(nav.getByRole('button', { name: nameOf('vis-a2') })).toContainText(
                'Hidden',
            );
            await expect(nav.getByRole('button', { name: nameOf('vis-a1') })).not.toContainText(
                'Hidden',
            );
            await expect(nav.locator(MARKER)).toHaveCount(1);

            await page.getByRole('button', { name: /Browse by category/ }).click();
            const menu = page.locator('.mv-catalog-dropdown');
            await menu
                .locator('.mv-catalog-dropdown__cat', { hasText: nameOf('vis-root') })
                .hover();
            for (const id of ['vis-root', 'vis-a', 'vis-a1', 'vis-b2'])
                await expect(menu).toContainText(nameOf(id));
            for (const id of ['vis-del', 'vis-off', 'vis-missing', 'vis-a2', 'vis-b', 'vis-b1'])
                await expect(
                    menu.locator(`a[href$="collection=${categorySlug(id)}"]`),
                ).toContainText('Hidden');
            for (const id of ['vis-a', 'vis-a1', 'vis-b2'])
                await expect(
                    menu.locator(`a[href$="collection=${categorySlug(id)}"]`),
                ).not.toContainText('Hidden');
            await shot(page, 'manager-category-menu');

            await menu.locator(`a[href$="collection=${categorySlug('vis-a2')}"]`).click();
            await expect(page).toHaveURL(/collection=cat-vis-a2/);
            await expect(page.getByRole('heading', { level: 1 })).toHaveText(nameOf('vis-a2'));
            await expect(page.getByText(categorySku('vis-a2'), { exact: true })).toBeVisible();
            await shot(page, 'manager-category-open-hidden');
        } finally {
            await s.context.close();
        }
    });

    test('settings page shows the hidden reason per category', async ({ browser }) => {
        const s = await openSuperadmin(browser);
        try {
            const { page } = s;
            await page.goto(SETTINGS);
            const expected: [string, string][] = [
                ['vis-a2', 'Manual override'],
                ['vis-a2x', 'Hidden ancestor'],
                ['vis-b', 'Own feed'],
                ['vis-b1', 'Hidden ancestor'],
                ['vis-del', 'Own feed'],
                ['vis-off', 'Own feed'],
                ['vis-missing', 'Own feed'],
            ];
            for (const [id, reason] of expected) {
                await search(page, id);
                await expect(row(page, id)).toContainText(reason);
            }
            for (const id of ['vis-a1', 'vis-b2']) {
                await search(page, id);
                await expect(row(page, id)).toContainText('Visible');
                await expect(row(page, id)).not.toContainText(
                    /Hidden ancestor|Own feed|Manual override/,
                );
            }
            await shot(page, 'manager-category-settings');
        } finally {
            await s.context.close();
        }
    });

    test('an authorized staff member curates an override and restores it', async ({ browser }) => {
        const s = await openSuperadmin(browser);
        try {
            const { page } = s;
            await page.goto(SETTINGS);
            await search(page, 'vis-a1');
            await row(page, 'vis-a1').locator('select').selectOption('hidden');
            await expect(row(page, 'vis-a1')).toContainText('Manual override');
            await waitForShopSlug('cat-vis-a1', false);
            await shot(page, 'manager-category-override');

            await row(page, 'vis-a1').locator('select').selectOption('');
            await expect(row(page, 'vis-a1')).not.toContainText('Manual override');
            await waitForShopSlug('cat-vis-a1', true);
            expect(await shopSlugs()).toContain('cat-vis-a1');
        } finally {
            await s.context.close();
        }
    });

    test('an operator without the catalog permission cannot change overrides', async ({
        browser,
    }) => {
        const s = await openManagerAs(browser, 'operator-a');
        try {
            const { page } = s;
            await page.goto(SETTINGS);
            await expect(page.getByRole('heading', { name: 'Not authorized' })).toBeVisible();
            await expect(page.locator('select')).toHaveCount(0);
            await shot(page, 'manager-category-denied');
        } finally {
            await s.context.close();
        }
    });
});
