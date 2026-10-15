import { test, expect } from '@playwright/test';

// Regression guard: PrimeVue's menu filter overlay swallows the next outside click after inner use.
// E2E only: needs browser popover/event bubbling; History tab has always-enabled select filters.
test.describe('customer History tab — column filter overlays', () => {
    async function openHistoryTab(page: import('@playwright/test').Page): Promise<void> {
        await page.goto('/customers');
        const row = page.locator('.el-table-v2__row', { hasText: 'E2E Co' });
        await row.waitFor({ timeout: 15000 });
        await row.click({ position: { x: 20, y: 10 } });
        await expect(page).toHaveURL(/\/customers\/.+/);
        await page.getByRole('button', { name: 'History' }).click();
        await expect(page.locator('.p-datatable-column-filter-button').first()).toBeVisible({
            timeout: 15000,
        });
        // The tab's load() replaces rows asynchronously on mount.
        // PrimeVue's filter popover can fail to open reliably mid-remount, so wait for it to settle.
        await page.waitForTimeout(1000);
    }

    function filterButtonFor(
        page: import('@playwright/test').Page,
        columnHeader: string,
    ): ReturnType<import('@playwright/test').Page['locator']> {
        return page
            .locator('.mv-advanced-data-table__grid thead th', { hasText: columnHeader })
            .locator('button.p-datatable-column-filter-button');
    }

    test('opening a second column filter closes the first, even after interacting inside it', async ({
        page,
    }, testInfo) => {
        test.skip(testInfo.project.name !== 'manager-portal-admin', 'UI-kit-level test, runs once');
        await openHistoryTab(page);

        await filterButtonFor(page, 'When').click();
        await expect(page.locator('.p-datatable-filter-overlay')).toHaveCount(1);

        // Interact inside the open overlay (our own MvColumnFilterSelect's trigger) — this is
        // exactly the step that poisoned PrimeVue's outside-click detection before the fix.
        await page.locator('.p-datatable-filter-overlay .mv-column-filter-select__trigger').click();

        await filterButtonFor(page, 'Changed by').click();

        // Before the fix: 2 (the stale "When" overlay stacked with the new "Changed by" one).
        await expect(page.locator('.p-datatable-filter-overlay')).toHaveCount(1);
        await expect(page.locator('.p-datatable-filter-overlay')).toContainText('Anyone');
    });

    test('a single outside click closes an overlay after interacting inside it', async ({
        page,
    }, testInfo) => {
        test.skip(testInfo.project.name !== 'manager-portal-admin', 'UI-kit-level test, runs once');
        await openHistoryTab(page);

        await filterButtonFor(page, 'When').click();
        await expect(page.locator('.p-datatable-filter-overlay')).toBeVisible();
        await page.waitForTimeout(300);
        await page.locator('.p-datatable-filter-overlay .mv-column-filter-select__trigger').click();

        // Before the fix: this first outside click was silently swallowed, requiring a second one.
        await page
            .locator('h1, h3')
            .first()
            .click({ position: { x: 2, y: 2 } });
        await expect(page.locator('.p-datatable-filter-overlay')).toHaveCount(0);
    });
});
