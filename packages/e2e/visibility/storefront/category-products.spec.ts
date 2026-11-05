import { expect, test, type Browser, type Page } from '@playwright/test';
import { categoryProductSlug } from '../../fixtures/visibility/categories';
import { E2E_BROWSER_USER_AGENT } from '../../helpers/user-agent';
import { HIDDEN, VISIBLE, catalogUrl } from '../categories';
import { openStorefrontAs, shot, type Session } from '../session';

const productName = (erpId: string): string => `Product of ${erpId}`;

async function openAnonymous(browser: Browser): Promise<Session> {
    const context = await browser.newContext({
        baseURL: process.env.STOREFRONT_URL ?? 'http://localhost:5173',
        storageState: undefined,
        userAgent: E2E_BROWSER_USER_AGENT,
    });
    const page = await context.newPage();
    const bodies: string[] = [];
    page.on('response', response => {
        if (!/\/shop-api/.test(response.url())) return;
        void response.text().then(
            text => bodies.push(text),
            () => undefined,
        );
    });
    return { context, page, bodies };
}

async function settleCatalog(page: Page): Promise<void> {
    await expect(page.locator('.catalog-page')).toBeVisible();
    await expect(page.getByText(/Loading/)).toHaveCount(0, { timeout: 20_000 });
}

async function expectOnlyVisibleProducts(page: Page, scope: string[]): Promise<void> {
    for (const id of scope.filter(id => VISIBLE.includes(id)))
        await expect(page.getByText(productName(id), { exact: true }).first()).toBeVisible();
    for (const id of scope.filter(id => HIDDEN.includes(id)))
        await expect(page.getByText(productName(id), { exact: true })).toHaveCount(0);
}

const ACTORS: { name: string; open: (browser: Browser) => Promise<Session> }[] = [
    { name: 'anonymous visitor', open: openAnonymous },
    { name: 'customer', open: browser => openStorefrontAs(browser, 'customer-a') },
];

for (const actor of ACTORS) {
    test.describe(`16: products of hidden categories, storefront as ${actor.name}`, () => {
        let s: Session;
        test.beforeAll(async ({ browser }) => {
            s = await actor.open(browser);
        });
        test.afterAll(async () => {
            await s.context.close();
        });

        test('text search finds visible products and no hidden-category product', async () => {
            const { page } = s;
            await page.goto('/catalog?q=Product%20of%20vis');
            await settleCatalog(page);
            await expectOnlyVisibleProducts(page, [...VISIBLE, ...HIDDEN]);
            for (const id of HIDDEN)
                expect(s.bodies.join('\n'), id).not.toContain(`"${productName(id)}"`);
            await shot(page, 'category-products-search');
        });

        test('the category listing of a visible root excludes its hidden subtree products', async () => {
            const { page } = s;
            await page.goto(catalogUrl('vis-root'));
            await settleCatalog(page);
            await expectOnlyVisibleProducts(page, [...VISIBLE, ...HIDDEN]);
            await shot(page, 'category-products-listing');
        });

        test('a hidden category URL lists nothing, with a feed-hidden or override-hidden branch', async () => {
            const { page } = s;
            for (const id of ['vis-a2', 'vis-b', 'vis-del']) {
                await page.goto(catalogUrl(id));
                await settleCatalog(page);
                await expect(page.getByText('No products found')).toBeVisible();
            }
        });

        test('a hidden-category product page is not found, a visible one opens', async () => {
            const { page } = s;
            await page.goto(`/product/${categoryProductSlug('vis-a2')}`);
            await expect(page.getByText('Product not found')).toBeVisible();
            await page.goto(`/product/${categoryProductSlug('vis-a1')}`);
            await expect(page.getByRole('heading', { name: productName('vis-a1') })).toBeVisible();
        });

        test('search suggestions never offer a hidden-category product', async () => {
            const { page } = s;
            await page.goto('/catalog');
            await settleCatalog(page);
            const input = page.locator('.app-header__search input').first();
            const answered = page.waitForResponse(
                r =>
                    r.url().includes('/shop-api') &&
                    r.request().postData()?.includes('Suggest') === true,
            );
            await input.fill('Product of vis-a');
            await answered;
            const text = s.bodies.join('\n');
            for (const id of HIDDEN) expect(text, id).not.toContain(`"${productName(id)}"`);
        });
    });
}
