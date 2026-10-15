import { test, expect } from '@playwright/test';

// Covers every page using MvPagination: the blur() on Next/Previous and MvTable height from the
// current page's row count (not pageSize) must hold everywhere, not only on the original page.
const PAGES = [
    '/orders',
    '/proforma-invoices',
    '/payments',
    '/discounts',
    '/customers',
    '/approvals',
    '/catalog',
];

for (const path of PAGES) {
    test(`clicking Next on ${path} does not snap the page back to the top`, async ({
        page,
    }, testInfo) => {
        test.skip(
            testInfo.project.name !== 'manager-portal-admin',
            'UI-mechanics test, one project is enough',
        );

        await page.setViewportSize({ width: 1280, height: 500 });
        await page.goto(path);

        const nextButton = page.getByRole('button', { name: 'Next' }).last();
        await expect(nextButton).toBeVisible({ timeout: 15000 });
        if (await nextButton.isDisabled()) {
            test.skip(true, 'not enough rows on this page to reach a second page');
        }

        await nextButton.scrollIntoViewIfNeeded();
        const scrollBefore = await page.evaluate(() => window.scrollY);
        if (scrollBefore === 0) {
            test.skip(true, 'page content is shorter than the viewport, nothing to snap back from');
        }

        await nextButton.click();
        await page.waitForTimeout(300);

        const scrollAfter = await page.evaluate(() => window.scrollY);
        expect(scrollAfter).toBeGreaterThan(0);
    });
}
