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

        // global-setup seeds a second page on every list; a disabled Next means that seed is missing.
        const nextButton = page.getByRole('button', { name: 'Next' }).last();
        await expect(page.getByText(/Page 1 of ([2-9]|\d{2,})/).first()).toBeVisible({
            timeout: 15000,
        });
        await expect(nextButton).toBeEnabled();

        await nextButton.scrollIntoViewIfNeeded();
        const scrollBefore = await page.evaluate(() => window.scrollY);
        expect(scrollBefore, 'a 500px viewport must scroll to reach Next').toBeGreaterThan(0);

        await nextButton.click();
        await page.waitForTimeout(300);

        const scrollAfter = await page.evaluate(() => window.scrollY);
        expect(scrollAfter).toBeGreaterThan(0);
    });
}
