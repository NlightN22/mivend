import { test, expect } from '@playwright/test';

// Regression coverage for the scroll-collapse bug fixed once, at the shared layer, in
// MvPagination.vue (defensive blur() on Next/Previous) + every MvTable-based list sizing its
// height off `pageSize` instead of the current page's row count (see git history:
// orders-pagination.spec.ts's comment for the original root-cause writeup). This test proves
// the shared fix actually holds across every page that renders MvPagination, not just the one
// page it was originally diagnosed on.
const PAGES = [
    '/orders',
    '/invoices',
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
