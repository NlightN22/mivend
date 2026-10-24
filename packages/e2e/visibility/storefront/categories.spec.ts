import { expect, test, type Page } from '@playwright/test';
import { categoryProductSlug, categorySlug } from '../../fixtures/visibility/categories';
import { OILS_EXPECTED, readSidebar } from '../../helpers/category-sidebar';
import { HIDDEN, VISIBLE, catalogUrl, expectNoHiddenCategory, nameOf } from '../categories';
import { openStorefrontAs, shot, type Session } from '../session';

let s: Session;

test.beforeAll(async ({ browser }) => {
    s = await openStorefrontAs(browser, 'customer-a');
});

test.afterAll(async () => {
    await s.context.close();
});

const pageText = (page: Page): Promise<string> => page.locator('body').innerText();

async function settleCatalog(page: Page): Promise<void> {
    await expect(page.locator('.catalog-page')).toBeVisible();
    await expect(page.getByText(/Loading/)).toHaveCount(0, { timeout: 20_000 });
}

test.describe('14: category visibility, storefront as a customer', () => {
    test('header mega-menu lists the visible tree and none of the hidden subtree', async () => {
        const { page } = s;
        await page.goto('/catalog');
        await page.locator('.app-header__catalog-btn').click();
        const menu = page.locator('.mv-catalog-dropdown');
        await page.locator('.mv-catalog-dropdown__cat', { hasText: nameOf('vis-root') }).hover();
        for (const id of VISIBLE) await expect(menu).toContainText(nameOf(id));
        const lines = (await menu.innerText()).split('\n').map(l => l.trim());
        for (const id of HIDDEN) expect(lines, id).not.toContain(nameOf(id));
        await shot(page, 'category-mega-menu');
        expectNoHiddenCategory(s, '');
    });

    test('sidebar shows the visible children and a visible override under a hidden parent', async () => {
        const { page } = s;
        await page.goto(catalogUrl('vis-a'));
        await settleCatalog(page);
        const sidebar = await readSidebar(page);
        expect(sidebar.back).toEqual([nameOf('vis-root')]);
        expect(sidebar.current).toBe(nameOf('vis-a'));
        expect(sidebar.level).toEqual([nameOf('vis-a1')]);

        await page.goto(catalogUrl('vis-root'));
        await settleCatalog(page);
        const root = await readSidebar(page);
        expect(root.back).toEqual([]);
        expect(new Set(root.level)).toEqual(new Set([nameOf('vis-a'), nameOf('vis-b2')]));
        await shot(page, 'category-sidebar');
        expectNoHiddenCategory(s, await pageText(page));
    });

    test('breadcrumbs of a visible override drop the hidden ancestor', async () => {
        const { page } = s;
        await page.goto(catalogUrl('vis-b2x'));
        await settleCatalog(page);
        const crumbs = page.locator('.mv-breadcrumbs');
        await expect(crumbs).toContainText(nameOf('vis-b2'));
        await expect(crumbs).toContainText(nameOf('vis-b2x'));
        await shot(page, 'category-breadcrumbs');
        expectNoHiddenCategory(s, await pageText(page));
    });

    test('catalog category list has the visible top level and no deleted or inactive root', async () => {
        const { page } = s;
        await page.goto('/catalog');
        await settleCatalog(page);
        const nav = page.locator('.mv-category-nav');
        await expect(
            nav.getByRole('button', { name: nameOf('vis-root'), exact: true }),
        ).toBeVisible();
        await expect(nav.getByRole('button', { name: OILS_EXPECTED.back[0] })).toBeVisible();
        expectNoHiddenCategory(s, await pageText(page));
    });

    test('facet values and counts cover the visible tree only', async () => {
        const { page } = s;
        await page.goto('/catalog?q=Product%20of%20vis');
        await settleCatalog(page);
        const nav = page.locator('.mv-category-nav');
        await expect(nav.getByRole('button', { name: nameOf('vis-root') })).toContainText('9');
        await expect(nav.getByRole('button', { name: nameOf('vis-root') })).toBeVisible();
        await shot(page, 'category-facets');
        expectNoHiddenCategory(s, await pageText(page));
    });

    test('product page breadcrumb and links name only visible categories', async () => {
        const { page } = s;
        await page.goto(`/product/${categoryProductSlug('vis-b2x')}`);
        const crumbs = page.locator('.mv-breadcrumbs');
        await expect(crumbs).toContainText(nameOf('vis-b2x'));
        await expect(page.getByRole('heading', { name: 'Product of vis-b2x' })).toBeVisible();
        expectNoHiddenCategory(s, await pageText(page));
    });

    test('favorites of products from hidden categories show no category names', async () => {
        const { page } = s;
        await page.goto('/catalog?q=Product%20of%20vis-a');
        await settleCatalog(page);
        await page.getByRole('button', { name: 'Grid' }).click();
        const card = page.locator('.mv-product-card', { hasText: 'Product of vis-a2x' });
        await card.getByLabel('Toggle favorite').click();
        try {
            await page.goto('/favorites');
            await expect(page.getByText('Product of vis-a2x')).toBeVisible({ timeout: 20_000 });
            await shot(page, 'category-favorites');
            expectNoHiddenCategory(s, await pageText(page));
        } finally {
            await page.evaluate(() => localStorage.removeItem('mv_favorites'));
        }
    });

    test('direct URL of a hidden category is treated as unknown', async () => {
        const { page } = s;
        for (const id of ['vis-a2', 'vis-del']) {
            await page.goto(catalogUrl(id));
            await expect(page.locator('.catalog-page')).toBeVisible();
            await expect(page.getByText(/Loading/)).toHaveCount(0, { timeout: 20_000 });
            await expect(page.getByText(categorySlug(id))).toHaveCount(0);
            await shot(page, `category-direct-${id}`);
            expectNoHiddenCategory(s, await pageText(page));
        }
    });

    test.describe('category names reach the customer only for visible categories', () => {
        test('search facet values omit hidden categories', async () => {
            const { page } = s;
            await page.goto('/catalog');
            await settleCatalog(page);
            const raw = s.bodies.join('\n');
            for (const id of HIDDEN) expect(raw, id).not.toContain(`"${nameOf(id)}"`);
        });

        test('product page of a hidden-category product does not name the category', async () => {
            const { page } = s;
            await page.goto(`/product/${categoryProductSlug('vis-a2x')}`);
            await expect(page.getByRole('heading', { name: 'Product of vis-a2x' })).toBeVisible();
            await shot(page, 'category-product-hidden');
            expect(await pageText(page)).not.toContain(nameOf('vis-a2x'));
        });
    });
});
