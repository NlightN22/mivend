import { test, expect } from '@playwright/test';

// Pages still on MvPagination must keep the scroll position on Next/Previous.
// Table-paginator lists (orders, approvals, proforma invoices, payments, discounts) have their own specs.
const PAGES = ['/customers'];

for (const path of PAGES) {
    test(`clicking Next on ${path} does not snap the page back to the top @on:manager-portal-admin @read-only`, async ({
        page,
    }) => {
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
