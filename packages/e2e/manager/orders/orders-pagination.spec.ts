import { adminTokenFor } from '../../helpers/api-tokens';
import { test, expect } from '@playwright/test';
import { adminGql } from '../../helpers/api';
import { cancelTestOrder, createConfirmedOrder } from '../../helpers/manager-order';
import { E2E_CUSTOMER } from '../../fixtures/seed';

// Paging to the last page must not snap the window back to the top.
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
    try {
        for (let i = 0; i < topUp; i++) {
            const created = await createConfirmedOrder(token, customerId, productVariantId);
            createdOrderIds.push(created.id);
        }

        await page.goto('/orders');
        const rows = page.locator('.orders-data-table tbody tr');
        // 'Saved views' is static chrome and does not mean orders have loaded.
        await expect(rows).toHaveCount(PAGE_SIZE, { timeout: 15000 });

        // Other specs add and cancel orders of this customer meanwhile, so the page count is read
        // from the pager after each click instead of being computed once from a total.
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

        const pager = page.getByText(/Page \d+ of \d+/).first();
        const nextButton = page.getByRole('button', { name: 'Next' }).first();
        for (let guard = 0; guard < 100; guard++) {
            const [current, total] =
                ((await pager.textContent()) ?? '').match(/\d+/g)?.map(Number) ?? [];
            expect(total, 'pager total').toBeGreaterThan(0);
            if (current >= total) break;
            await nextButton.click();
            await expect(pager).toContainText(`Page ${current + 1} of`);
        }
        await expect(rows.first()).toBeVisible();

        // The core regression: pagination must not snap the window back to the top.
        const scrollYAfterClick = await page.evaluate(() => window.scrollY);
        expect(scrollYAfterClick).toBeGreaterThan(0);
    } finally {
        for (const orderId of createdOrderIds) {
            await cancelTestOrder(token, orderId);
        }
    }
});
