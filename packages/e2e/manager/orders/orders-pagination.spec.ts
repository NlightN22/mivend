import { adminTokenFor } from '../../helpers/api-tokens';
import { test, expect } from '@playwright/test';
import { adminGql } from '../../helpers/api';
import { cancelTestOrder, createConfirmedOrder } from '../../helpers/manager-order';
import { E2E_CUSTOMER } from '../../fixtures/seed';

// Paging to the last page must not snap the window back to the top.
test('orders list pagination does not collapse the page to the top @on:manager-operator', async ({
    page,
}) => {
    // Short enough that even a one-row last page stays scrollable; otherwise scrollY is 0
    // for a legitimate reason and the assertion proves nothing.
    await page.setViewportSize({ width: 1280, height: 300 });

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

    // Ensure at least PAGE_SIZE + 1 listed orders so a partial last page exists; the list hides
    // cancelled orders. Created orders are cancelled in finally so the customer's count does not grow.
    const existingResult = await adminGql<{
        customer: { orders: { totalItems: number } } | null;
    }>(
        `query($id: ID!) { customer(id: $id) {
            orders(options: { take: 0, filter: { state: { notEq: "Cancelled" } } }) { totalItems }
        } }`,
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
        const rows = page.locator('.mv-advanced-data-table__grid tbody tr');
        await expect(rows).toHaveCount(PAGE_SIZE, { timeout: 15000 });

        // Other specs add and cancel orders of this customer meanwhile, so the end of the list is
        // found by the disabled Next button instead of a total computed once.
        const nextButton = page.getByRole('button', { name: 'Next Page' });
        const currentPage = page.locator('.p-paginator-page[aria-current="page"]');
        for (let guard = 0; guard < 100; guard++) {
            if (await nextButton.isDisabled()) break;
            const before = (await currentPage.textContent()) ?? '';
            await nextButton.click();
            await expect(currentPage).not.toHaveText(before);
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
