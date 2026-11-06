import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

const STATIC_ROUTES = [
    '/',
    '/catalog',
    '/cart',
    '/checkout',
    '/orders',
    '/account',
    '/account/trading-points',
    '/account/balance',
    '/account/employees',
    '/account/settings',
    '/account/notifications',
    '/documents',
    '/settlements',
    '/reconciliation-acts',
    '/proforma-invoices',
    '/favorites',
    '/requests',
    '/terms',
];

async function firstLink(page: Page, from: string, pattern: RegExp): Promise<string | null> {
    await page.goto(from);
    await page.waitForLoadState('networkidle');
    const hrefs = await page
        .locator('a[href]')
        .evaluateAll(els => els.map(e => e.getAttribute('href') ?? ''));
    return hrefs.find(h => pattern.test(h)) ?? null;
}

async function overflow(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth <= width) return [];
        const clipped = (el: Element): boolean => {
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
                if (getComputedStyle(a).overflowX !== 'visible') return true;
            }
            return false;
        };
        const wide = [...document.querySelectorAll('body *')].filter(el => {
            const r = el.getBoundingClientRect();
            return (
                r.right > width + 1 &&
                r.width > 0 &&
                getComputedStyle(el).position !== 'fixed' &&
                !clipped(el)
            );
        });
        if (!wide.length) return [`document ${document.documentElement.scrollWidth} > ${width}`];
        return wide.slice(0, 5).map(el => `${el.tagName}.${String(el.className).slice(0, 50)}`);
    });
}

async function expectNoOverflow(page: Page, route: string): Promise<void> {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    expect(await overflow(page), route).toEqual([]);
}

for (const route of STATIC_ROUTES) {
    test(`${route} does not scroll horizontally on a phone`, async ({ page }) => {
        await expectNoOverflow(page, route);
    });
}

test('a product page does not scroll horizontally on a phone', async ({ page }) => {
    const product = await firstLink(page, '/catalog', /^\/product\//);
    expect(product, 'catalog lists a product').not.toBeNull();
    await expectNoOverflow(page, product as string);
});

test('an order page does not scroll horizontally on a phone', async ({ page }) => {
    const order = await firstLink(page, '/orders', /^\/orders\/[^/]+$/);
    expect(order, 'orders lists an order').not.toBeNull();
    await expectNoOverflow(page, order as string);
});
