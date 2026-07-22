import { test, expect } from '@playwright/test';

// Real, confirmed regression (reported by the user against the History tab's Object/Changed by
// filters, reproduced live via Playwright before the fix): PrimeVue's `filter-display="menu"`
// column filter overlay tracks a `selfClick` flag to distinguish "click landed inside my own
// overlay" from "click was genuinely outside", set whenever *any* click bubbles through the
// overlay's DOM and only cleared at the end of the *next* document click. That silently swallows
// exactly one subsequent outside click — a different column's filter icon included — after any
// interaction inside an open filter overlay (opening MvColumnFilterSelect's own inner dropdown,
// typing into a text filter, ticking a checkbox), so two overlays could end up stacked open at
// once. Fixed generically in MvAdvancedDataTable via
// installFilterOverlayClickFix/columnFilterDispatch.ts (ui-kit) — this is the regression test:
// browser-level Popover/event-bubbling behavior that jsdom can't faithfully reproduce, so E2E is
// the minimum sufficient level (not a unit/component duplicate — see AGENTS.md's testing-strategy
// "minimum sufficient level" rule). History is a good target because both `When` and `Changed by`
// are always-enabled `select`-type filters (unlike `Object`, which is conditionally disabled when
// a customer's history spans only one entity type) — deterministic regardless of seeded data.
//
// Restricted to one role project: this is a UI-kit-level interaction bug, not something that
// varies per role, and ReadEntityHistory (which gates the History tab) is leadership-only anyway
// (see infrastructure/scripts/seed-access-roles.mjs) — portal-admin has it.
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
        // The tab's own load() replaces `rows` asynchronously on mount — give the table a moment
        // to finish its initial re-render before touching a filter overlay, or PrimeVue's own
        // popover can fail to open reliably mid-remount (confirmed live: same flake exists on the
        // pre-fix code too, unrelated to this test's actual regression).
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
