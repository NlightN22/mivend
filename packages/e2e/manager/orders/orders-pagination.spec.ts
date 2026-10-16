import { adminTokenFor } from '../../helpers/api-tokens';
import { test, expect } from '@playwright/test';
import { adminGql } from '../../helpers/api';
import { createConfirmedOrder } from '../../helpers/manager-order';
import { E2E_CUSTOMER } from '../../fixtures/seed';

// Page height must come from pageSize, not the current page's row count: a short last page
// shrinks the document and the browser clamps scrollY to 0, looking like a spontaneous snap.
test('orders list pagination does not collapse the page to the top', async ({ page }, testInfo) => {
    test.skip(
        testInfo.project.name !== 'manager-operator',
        'UI-mechanics test, one project is enough',
    );

    // Short viewport so the page is guaranteed scrollable; on a tall viewport scrollY stays 0
    // and the 'snaps back to 0' assertion would pass vacuously.
    await page.setViewportSize({ width: 1280, height: 500 });

    const PAGE_SIZE = 10;

    const token = await adminTokenFor('ivan.operator@mivend.dev', 'Password123!');

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

    // Ensure at least PAGE_SIZE + 1 orders so a partial last page exists.
    // Cancel created orders in finally so the shared customer's order count doesn't grow per run.
    const existingResult = await adminGql<{
        customer: { orders: { totalItems: number } } | null;
    }>(
        `query($id: ID!) { customer(id: $id) { orders(options: { take: 0 }) { totalItems } } }`,
        { id: customerId },
        token,
    );
    const existingCount = existingResult.data.customer?.orders.totalItems ?? 0;
    const topUp = Math.max(0, PAGE_SIZE + 1 - existingCount);
    const createdOrderIds: string[] = [];
    for (let i = 0; i < topUp; i++) {
        const created = await createConfirmedOrder(token, customerId, productVariantId);
        createdOrderIds.push(created.id);
    }

    try {
        await page.goto('/orders');
        const rows = page.locator('.el-table-v2__row');
        // 'Saved views' is static chrome and does not mean orders have loaded.
        // Wait for a full first page of rows before reading totalItems, or the read races loading.
        await expect(rows).toHaveCount(PAGE_SIZE, { timeout: 15000 });

        // Read the live total: other specs sharing this customer may add orders during the run.
        // If it is an exact multiple of PAGE_SIZE the last page is full, so top up one order and reload.
        const totalText = await page.getByText(/orders across your accessible scope/).textContent();
        let totalItems = Number(totalText?.match(/(\d+)/)?.[1] ?? 0);
        if (totalItems > 0 && totalItems % PAGE_SIZE === 0) {
            const extra = await createConfirmedOrder(token, customerId, productVariantId);
            createdOrderIds.push(extra.id);
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

        // The table must stay sized for a full page even though the last page has fewer rows —
        // this is the actual fix under test, not just "did the page navigate".
        const heightOnLastPage = (await table.boundingBox())?.height ?? 0;
        expect(heightOnLastPage).toBeGreaterThan(400);

        // The core regression: pagination must not snap the window back to the top.
        const scrollYAfterClick = await page.evaluate(() => window.scrollY);
        expect(scrollYAfterClick).toBeGreaterThan(0);
    } finally {
        // Never leave fixture orders behind — this test must not grow the e2e customer's order
        // count run over run (see the topUp comment above for the real incident this caused).
        for (const orderId of createdOrderIds) {
            await adminGql(
                `mutation($input: CancelOrderInput!) { cancelOrder(input: $input) { __typename } }`,
                { input: { orderId } },
                token,
            );
        }
    }
});
