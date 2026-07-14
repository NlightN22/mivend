import { test, expect } from '@playwright/test';
import { adminGql } from '../../helpers/api';
import { createConfirmedOrder } from '../../helpers/manager-order';
import { E2E_CUSTOMER } from '../../fixtures/seed';

// Regression test for a real bug: OrdersTable sized its MvTable height off the *current page's*
// row count (`rows.length * 52 + 40`). The last, partial page renders far fewer rows than a full
// page, so the table — and the whole document — shrinks drastically the moment you paginate to
// it. The browser then clamps window.scrollY to the new (shorter) max scroll height, which reads
// as "the page snaps to the top" even though nothing asked it to scroll. Fixed by sizing the
// table off `pageSize` instead of the actual row count (see OrdersTable.vue's `pageSize` prop).
// Runs only against manager-operator — this is a UI-mechanics regression, not a role-visibility
// concern, so one project is enough.
test('orders list pagination does not collapse the page to the top', async ({ page }, testInfo) => {
    test.skip(
        testInfo.project.name !== 'manager-operator',
        'UI-mechanics test, one project is enough',
    );

    // A short viewport guarantees the page is actually scrollable — on a tall default desktop
    // viewport the whole Orders page can fit without scrolling at all, which would make the
    // "does the page snap back to scrollY 0" assertion meaningless (it'd already be 0).
    await page.setViewportSize({ width: 1280, height: 500 });

    const PAGE_SIZE = 10;

    const login = await adminGql<{ login: { __typename: string } }>(
        `mutation($id: String!, $pw: String!) { login(username: $id, password: $pw) { __typename ... on CurrentUser { id } } }`,
        { id: 'ivan.operator@mivend.dev', pw: 'Password123!' },
    );
    const token = login.token;
    if (!token) throw new Error('Could not log in as operator to seed pagination fixture orders');

    const customersResult = await adminGql<{
        customers: { items: { id: string; emailAddress: string }[] };
    }>(
        `query { customers(options: { take: 200 }) { items { id emailAddress } } }`,
        undefined,
        token,
    );
    const customerId = customersResult.data.customers.items.find(
        c => c.emailAddress === E2E_CUSTOMER.email,
    )?.id;
    if (!customerId) throw new Error(`Could not find Vendure customer for ${E2E_CUSTOMER.email}`);

    const variantsResult = await adminGql<{ productVariants: { items: { id: string }[] } }>(
        `query { productVariants(options: { filter: { sku: { eq: "E2E-OIL-001" } } }) { items { id } } }`,
        undefined,
        token,
    );
    const productVariantId = variantsResult.data.productVariants.items[0]?.id;
    if (!productVariantId) throw new Error('Could not find product variant E2E-OIL-001');

    // Make sure there are at least PAGE_SIZE + 1 orders so a partial last page exists at all —
    // earlier e2e runs may have already left plenty behind, this only tops up if needed.
    const existingResult = await adminGql<{
        customer: { orders: { totalItems: number } } | null;
    }>(
        `query($id: ID!) { customer(id: $id) { orders(options: { take: 0 }) { totalItems } } }`,
        { id: customerId },
        token,
    );
    const existingCount = existingResult.data.customer?.orders.totalItems ?? 0;
    const topUp = Math.max(0, PAGE_SIZE + 1 - existingCount);
    for (let i = 0; i < topUp; i++) {
        await createConfirmedOrder(token, customerId, productVariantId);
    }

    await page.goto('/orders');
    const rows = page.locator('.el-table-v2__row');
    // "Saved views" is static chrome, always present — it does not mean the async orders fetch
    // has resolved. Wait for a full first page of rows before reading totalItems below, or the
    // read would race the loading state.
    await expect(rows).toHaveCount(PAGE_SIZE, { timeout: 15000 });

    // Read the real current total (accumulates across local e2e runs — CI starts from a fresh
    // DB, but a repeatedly-run dev environment does not) so the last page reached below is
    // computed against reality, not a value only valid on a first, from-scratch run. If the
    // current total happens to be an exact multiple of PAGE_SIZE, the "last" page would be full,
    // which wouldn't exercise the fix — top up by one more order and reload in that case.
    const totalText = await page.getByText(/orders across your accessible scope/).textContent();
    let totalItems = Number(totalText?.match(/(\d+)/)?.[1] ?? 0);
    if (totalItems > 0 && totalItems % PAGE_SIZE === 0) {
        await createConfirmedOrder(token, customerId, productVariantId);
        await page.reload();
        await expect(rows).toHaveCount(PAGE_SIZE, { timeout: 15000 });
        const reloadedTotalText = await page
            .getByText(/orders across your accessible scope/)
            .textContent();
        totalItems = Number(reloadedTotalText?.match(/(\d+)/)?.[1] ?? 0);
    }
    const pageCount = Math.ceil(totalItems / PAGE_SIZE);
    const lastPageRowCount = totalItems - (pageCount - 1) * PAGE_SIZE;
    expect(lastPageRowCount).toBeLessThan(PAGE_SIZE); // sanity check: the last page is partial

    const table = page.locator('.mv-table').first();
    const heightOnFirstPage = (await table.boundingBox())?.height ?? 0;
    expect(heightOnFirstPage).toBeGreaterThan(400); // a full page (10 rows) is ~560px tall

    // Scroll down so a naive "reset scroll to top" bug is actually observable.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const scrollYBeforeClick = await page.evaluate(() => window.scrollY);
    expect(scrollYBeforeClick).toBeGreaterThan(0);

    const nextButton = page.getByRole('button', { name: 'Next' }).first();
    for (let clicked = 1; clicked < pageCount; clicked++) {
        await nextButton.click();
    }
    await expect(page.getByText(`Page ${pageCount} of`).first()).toBeVisible();
    await expect(rows).toHaveCount(lastPageRowCount);

    // The table must stay sized for a full page even though the last page has fewer rows — this
    // is the actual fix under test, not just "did the page navigate".
    const heightOnLastPage = (await table.boundingBox())?.height ?? 0;
    expect(heightOnLastPage).toBeGreaterThan(400);

    // The core regression: pagination must not snap the window back to the top.
    const scrollYAfterClick = await page.evaluate(() => window.scrollY);
    expect(scrollYAfterClick).toBeGreaterThan(0);
});
