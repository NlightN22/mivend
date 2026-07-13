import { test, expect } from '@playwright/test';
import { readE2eOrder } from '../../helpers/e2e-order';

async function openE2eCustomerDetail(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/customers');
    const row = page.locator('.el-table-v2__row', { hasText: 'E2E Co' });
    await row.waitFor({ timeout: 15000 });
    await row.click({ position: { x: 20, y: 10 } });
    await expect(page).toHaveURL(/\/customers\/.+/);
}

// page.request shares the browser context's session cookie (manager portal's admin API client
// uses credentials:'include', not a bearer token — see api/client.ts), so this hits the real
// admin-api as the currently-logged-in user, authenticated exactly like the page's own fetches.
async function adminApiViaPage<T>(
    page: import('@playwright/test').Page,
    query: string,
    variables?: Record<string, unknown>,
): Promise<T> {
    const res = await page.request.post('/admin-api', { data: { query, variables } });
    const json = (await res.json()) as { data: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '));
    return json.data;
}

// This spec file runs against 3 role-based projects sharing the same backend — force the
// trading point back to isActive:false before the reactivate test so its assertions don't
// depend on which project happens to run first (see also global-setup.ts's idempotency guard
// for the same "shared backend across projects" issue with discount grants).
async function forceInactiveTradingPoint(page: import('@playwright/test').Page): Promise<void> {
    const data = await adminApiViaPage<{
        counterparties: { tradingPoints: { id: string; erpId: string }[] }[];
    }>(page, `query { counterparties { tradingPoints { id erpId } } }`);
    const tp = data.counterparties
        .flatMap(c => c.tradingPoints)
        .find(t => t.erpId === 'e2e-tp-004');
    if (!tp) throw new Error('e2e-tp-004 not found');
    await adminApiViaPage(
        page,
        `mutation($id: ID!) { setTradingPointActive(id: $id, isActive: false) { id } }`,
        { id: tp.id },
    );
}

test('customers page shows the client list with company meta and KPIs', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByText('Client list')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Active clients')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();

    const row = page.locator('.el-table-v2__row', { hasText: 'E2E Co' });
    await expect(row).toBeVisible();
});

test('customers page CSV export downloads a file', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByText('Client list')).toBeVisible({ timeout: 15000 });

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('customers.csv');
});

test('clicking a customer row navigates to the customer detail page', async ({ page }) => {
    await openE2eCustomerDetail(page);
});

test('customer detail Overview tab shows contacts, price type and trading points', async ({
    page,
}) => {
    await openE2eCustomerDetail(page);
    await page.waitForLoadState('networkidle');

    // Overview is the default tab — no click needed.
    await expect(page.getByText('WHOLESALE')).toBeVisible();
    await expect(page.getByText('Trading points')).toBeVisible();
    await expect(page.getByText('E2E Trading Point')).toBeVisible();
    await expect(page.getByText('E2E North Depot')).toBeVisible();
    await expect(page.getByText('E2E Warehouse')).toBeVisible();

    await expect(page.getByText('Sales last 30 days')).toBeVisible();
    await expect(page.getByText('Open orders')).toBeVisible();
});

test('customer detail Orders tab shows the seeded e2e order', async ({ page }) => {
    const order = readE2eOrder();
    await openE2eCustomerDetail(page);

    await page.getByRole('button', { name: 'Orders' }).click();
    await expect(page.getByText(order.code)).toBeVisible({ timeout: 15000 });
});

test('customer detail Discounts tab shows a grant scoped to this customer (positive)', async ({
    page,
}) => {
    await openE2eCustomerDetail(page);

    await page.getByRole('button', { name: 'Discounts' }).click();
    // global-setup.ts seeds an approved DiscountGrant scoped to the e2e counterparty at 8% —
    // via the real requestDiscountGrant -> decideDiscountGrantRequest workflow, not a DB
    // bypass — see DiscountGrantService.decideAndApply.
    await expect(page.getByText('8%')).toBeVisible({ timeout: 15000 });
});

test('customer detail Discounts tab does not leak a grant scoped to another customer (negative)', async ({
    page,
}) => {
    await openE2eCustomerDetail(page);

    await page.getByRole('button', { name: 'Discounts' }).click();
    await expect(page.getByText('8%')).toBeVisible({ timeout: 15000 });
    // global-setup.ts also seeds an approved DiscountGrant at 99%, but scoped only to
    // E2E_OTHER_COUNTERPARTY_ID — DiscountGrantService.findForCounterparty must exclude it
    // from this customer's tab (the bug this whole query was written to fix).
    await expect(page.getByText('99%')).not.toBeVisible();
});

test('customer detail Documents tab shows the customer document list', async ({ page }) => {
    await openE2eCustomerDetail(page);

    await page.getByRole('button', { name: 'Documents' }).click();
    // Documents are seeded independently of this spec (see other e2e specs' document fixtures) —
    // assert on the tab rendering real rows rather than a specific count, which would make this
    // test brittle against unrelated seed changes.
    await expect(page.getByText('contract').first()).toBeVisible({ timeout: 15000 });
});

test('editing a trading point via the real updateTradingPointDetails mutation updates the address (positive)', async ({
    page,
}) => {
    const newAddress = `Edited Street ${Date.now()}`;
    await openE2eCustomerDetail(page);
    await page.waitForLoadState('networkidle');

    const row = page.locator('li', { hasText: 'E2E Trading Point' });
    await row.getByRole('button', { name: 'Edit' }).click();
    const addressInput = page.getByRole('dialog').getByRole('textbox').nth(1);
    await addressInput.fill(newAddress);
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByText(newAddress)).toBeVisible({ timeout: 15000 });
});

test('reactivating the seeded inactive trading point flips its badge to Active (positive)', async ({
    page,
}) => {
    await forceInactiveTradingPoint(page);
    await openE2eCustomerDetail(page);
    await page.waitForLoadState('networkidle');

    const row = page.locator('li', { hasText: 'E2E Inactive Point' });
    await expect(row.getByText('Inactive', { exact: true })).toBeVisible({ timeout: 15000 });
    await row.getByRole('button', { name: 'Reactivate' }).click();

    await expect(row.getByText('Active', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(row.getByRole('button', { name: 'Reactivate' })).toHaveCount(0);
});

// CustomPermission.ReadEntityHistory is leadership-only (department-head/general-director/
// security-officer/portal-admin) — see infrastructure/scripts/seed-access-roles.mjs. Only
// manager-department-head is pre-authenticated among this spec's three projects (see
// playwright.config.ts), so the positive case runs there and the negative case on the other two.
test('History tab is visible for department-head and lists the edit/reactivate entries (positive)', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'manager-department-head', 'Leadership-only feature');

    await openE2eCustomerDetail(page);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'History' }).click();
    // EntityHistoryPanel renders one MvTable row per version — action/object/changed-by are
    // separate cells, so match on the row's full accessible name rather than a single text node.
    await expect(page.getByRole('row', { name: /Updated.*Trading point/ }).first()).toBeVisible({
        timeout: 15000,
    });
    await expect(page.getByRole('row', { name: /Reactivated.*Trading point/ }).first()).toBeVisible(
        { timeout: 15000 },
    );
});

test('History tab is absent for non-leadership roles (negative)', async ({ page }, testInfo) => {
    // department-head and portal-admin both hold ReadEntityHistory (leadership roles) — see
    // seed-access-roles.mjs — so the History tab correctly appears for them; this negative case
    // only applies to operator/manager.
    test.skip(
        ['manager-department-head', 'manager-portal-admin'].includes(testInfo.project.name),
        'Covered by the positive case',
    );

    await openE2eCustomerDetail(page);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: 'History' })).toHaveCount(0);
});

// TradingPointService.updateDetails logs real contact values (name/phone/email), not just a
// count — previously "contacts: 0 -> 0" showed up as a no-op diff on every save because the
// edit form always resubmits the full contacts array. These two cases cover both halves: an
// actual contact change must show up with the contact's name, and an address-only save must
// NOT produce a spurious "contacts" row. Only department-head can open the detail modal
// (ReadEntityHistory), so both run there.
test('editing a trading point contact records a readable contacts diff (positive)', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'manager-department-head', 'Needs ReadEntityHistory');

    const contactName = `QA Contact ${Date.now()}`;
    await openE2eCustomerDetail(page);
    await page.waitForLoadState('networkidle');

    const row = page.locator('li', { hasText: 'E2E Trading Point' });
    await row.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('button', { name: '+ Add contact' }).click();
    // Prior runs may have already left a contact on this trading point (state persists across
    // test runs) — the newly added row is always the last one.
    await page.getByRole('dialog').getByPlaceholder('Name').last().fill(contactName);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15000 });

    await page.getByRole('button', { name: 'History' }).click();
    await page
        .getByRole('row', { name: /Updated.*Trading point/ })
        .first()
        .click();

    const modal = page.getByRole('dialog');
    await expect(modal.getByText('contacts')).toBeVisible({ timeout: 15000 });
    await expect(modal.getByText(contactName)).toBeVisible();
});

test('editing only the trading point address does not record a spurious contacts diff (negative)', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'manager-department-head', 'Needs ReadEntityHistory');

    const newAddress = `Addr Only ${Date.now()}`;
    await openE2eCustomerDetail(page);
    await page.waitForLoadState('networkidle');

    const row = page.locator('li', { hasText: 'E2E Trading Point' });
    await row.getByRole('button', { name: 'Edit' }).click();
    const addressInput = page.getByRole('dialog').getByRole('textbox').nth(1);
    await addressInput.fill(newAddress);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(newAddress)).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'History' }).click();
    // "address, contacts" rows from the earlier positive test also contain the substring
    // "address" — exclude them explicitly so this only matches a true address-only entry.
    await page
        .getByRole('row', { name: /Updated.*Trading point/ })
        .filter({ hasText: 'address', hasNotText: 'contacts' })
        .first()
        .click();

    const modal = page.getByRole('dialog');
    await expect(modal.getByText('address', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(modal.getByText('contacts', { exact: true })).toHaveCount(0);
});

// Counterparty-level edits (CounterpartyService.reassignManager) must also produce
// EntityVersion rows — the History tab already fetches entityVersions('Counterparty', id),
// but reassignManager only started calling VersioningService.recordChange recently, so this is
// its own positive/negative pair rather than folded into the TradingPoint History test above.
// Only department-head holds both ReassignCounterpartyManager and ReadEntityHistory, so both
// cases run there.
test('reassigning the counterparty manager records a Counterparty version entry (positive)', async ({
    page,
}, testInfo) => {
    test.skip(
        testInfo.project.name !== 'manager-department-head',
        'Needs ReassignCounterpartyManager + ReadEntityHistory',
    );

    const cpData = await adminApiViaPage<{
        counterparties: { id: string; erpId: string; assignedManagerId: string | null }[];
    }>(page, `query { counterparties { id erpId assignedManagerId } }`);
    const counterparty = cpData.counterparties.find(c => c.erpId === 'e2e-cnt-001');
    if (!counterparty) throw new Error('e2e-cnt-001 not found');
    const originalManagerId = counterparty.assignedManagerId;

    const me = await adminApiViaPage<{ activeAdministrator: { id: string } }>(
        page,
        `query { activeAdministrator { id } }`,
    );

    const before = await adminApiViaPage<{ entityVersions: { id: string }[] }>(
        page,
        `query($entityId: ID!) { entityVersions(entityName: "Counterparty", entityId: $entityId) { id } }`,
        { entityId: counterparty.id },
    );

    await adminApiViaPage(
        page,
        `mutation($cid: ID!, $aid: ID!) { reassignCounterpartyManager(counterpartyId: $cid, administratorId: $aid) { id } }`,
        { cid: counterparty.id, aid: me.activeAdministrator.id },
    );

    try {
        const after = await adminApiViaPage<{ entityVersions: { id: string }[] }>(
            page,
            `query($entityId: ID!) { entityVersions(entityName: "Counterparty", entityId: $entityId) { id } }`,
            { entityId: counterparty.id },
        );
        expect(after.entityVersions.length).toBe(before.entityVersions.length + 1);

        await openE2eCustomerDetail(page);
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: 'History' }).click();
        // CustomerDetailPage.vue's entityLabels maps entityName "Counterparty" -> "Customer"
        // for display, so the Object column shows "Customer", not the raw entity name.
        await expect(page.getByRole('row', { name: /Updated.*Customer/ }).first()).toBeVisible({
            timeout: 15000,
        });
    } finally {
        // Restore so re-runs (and the "own" scope e2e fixtures elsewhere) see a stable assignee.
        if (originalManagerId) {
            await adminApiViaPage(
                page,
                `mutation($cid: ID!, $aid: ID!) { reassignCounterpartyManager(counterpartyId: $cid, administratorId: $aid) { id } }`,
                { cid: counterparty.id, aid: originalManagerId },
            );
        }
    }
});

test('a rejected out-of-department reassignment records no Counterparty version entry (negative)', async ({
    page,
}, testInfo) => {
    test.skip(
        testInfo.project.name !== 'manager-department-head',
        'Needs ReassignCounterpartyManager + ReadEntityHistory',
    );

    const cpData = await adminApiViaPage<{ counterparties: { id: string; erpId: string }[] }>(
        page,
        `query { counterparties { id erpId } }`,
    );
    const counterparty = cpData.counterparties.find(c => c.erpId === 'e2e-cnt-001');
    if (!counterparty) throw new Error('e2e-cnt-001 not found');

    const before = await adminApiViaPage<{ entityVersions: { id: string }[] }>(
        page,
        `query($entityId: ID!) { entityVersions(entityName: "Counterparty", entityId: $entityId) { id } }`,
        { entityId: counterparty.id },
    );

    // "999999" resolves to no administrator, so CounterpartyService.reassignManager's
    // department-scope check (target must share the caller's department) always rejects it —
    // no need to seed a real cross-department administrator for this.
    await expect(
        adminApiViaPage(
            page,
            `mutation($cid: ID!, $aid: ID!) { reassignCounterpartyManager(counterpartyId: $cid, administratorId: $aid) { id } }`,
            { cid: counterparty.id, aid: '999999' },
        ),
    ).rejects.toThrow();

    const after = await adminApiViaPage<{ entityVersions: { id: string }[] }>(
        page,
        `query($entityId: ID!) { entityVersions(entityName: "Counterparty", entityId: $entityId) { id } }`,
        { entityId: counterparty.id },
    );
    expect(after.entityVersions.length).toBe(before.entityVersions.length);
});
