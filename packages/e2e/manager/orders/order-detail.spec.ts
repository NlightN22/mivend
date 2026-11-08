import { test, expect, type Page } from '@playwright/test';
import { readE2eOrder } from '../../helpers/e2e-order';
import { adminGql } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import { releaseOrderReservation } from '../../helpers/manager-order';
import { MANAGER_ACCOUNTS } from '../../fixtures/accounts';

test('order detail shows the header fields, the customer summary, the lines table and the history below @read-only', async ({
    page,
}) => {
    const order = readE2eOrder();

    await page.goto(`/orders/${order.code}`);
    await expect(page.getByRole('heading', { name: 'Order lines' })).toBeVisible({
        timeout: 15000,
    });
    const fields = page.locator('.order-fields');
    for (const label of ['Contract', 'Delivery', 'Price type', 'ERP registration']) {
        await expect(fields).toContainText(label);
    }
    await expect(page.getByTestId('order-customer-summary')).toContainText('Credit limit');
    await expect(page.locator('.mv-doc-lines__table thead')).toContainText('Available');
    await expect(page.locator('.mv-doc-lines__table thead')).toContainText('Discount');
    await expect(page.locator('.mv-doc-lines__table thead')).toContainText('Reserve');
    await expect(page.getByTestId('doc-total-positions')).toContainText('Positions');
    await expect(page.getByText('E2E Co').first()).toBeVisible();

    for (const removed of ['Order context', 'Order controls', 'Approvals for this order']) {
        await expect(page.getByRole('heading', { name: removed })).toHaveCount(0);
    }
});

test("the action menu opens this order's proforma invoices and documents @read-only", async ({
    page,
}) => {
    await page.goto(`/orders/${readE2eOrder().code}`);
    await expect(page.getByRole('heading', { name: 'Order lines' })).toBeVisible({
        timeout: 15000,
    });

    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Proforma invoices' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText('Proforma invoices');
    await expect(modal.getByRole('link', { name: 'Open in the list' })).toHaveAttribute(
        'href',
        /\/proforma-invoices\?search=/,
    );
    await modal.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Documents' }).click();
    await expect(page.getByRole('dialog')).toContainText('Documents');
});

test('a flagged cell shows only an icon and opens a popover with what is wrong there @read-only', async ({
    page,
}) => {
    await page.goto(`/orders/${readE2eOrder().code}`);
    await expect(page.getByRole('heading', { name: 'Order lines' })).toBeVisible({
        timeout: 15000,
    });

    const flag = page.getByRole('button', { name: 'Show what is wrong here' }).first();
    await expect(flag).toBeVisible();
    await expect(flag).toHaveText('');
    await flag.click();
    await expect(page.locator('.cell-flag__list')).toBeVisible();

    for (const duplicated of ['Reservation failed', 'Cut for lack of stock', 'ERP document']) {
        await expect(page.getByRole('heading', { name: duplicated })).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: 'Cut lines to available stock' })).toHaveCount(0);
});

test.describe('reservation of the shared e2e order', () => {
    // Every role project confirms the same order, so each test starts and ends unreserved.
    let token: string;

    test.beforeEach(async () => {
        token = await adminTokenFor(
            MANAGER_ACCOUNTS.operator.username,
            MANAGER_ACCOUNTS.operator.password,
        );
        const order = readE2eOrder();
        await releaseOrderReservation(token, order.id);
        const lines = await adminGql<{
            order: { lines: { quantity: number; productVariant: { id: string; sku: string } }[] };
        }>(
            `query($id: ID!) { order(id: $id) { lines { quantity productVariant { id sku } } } }`,
            { id: order.id },
            token,
        );
        for (const line of lines.data.order.lines) {
            const stock = await adminGql<{ availableStock: number }>(
                `query($v: ID!, $o: ID) { availableStock(productVariantId: $v, orderId: $o) }`,
                { v: line.productVariant.id, o: order.id },
                token,
            );
            if (stock.data.availableStock < line.quantity) {
                throw new Error(
                    `${line.productVariant.sku}: available ${stock.data.availableStock} < ${line.quantity}; stale reservations hold the e2e stock`,
                );
            }
        }
    });

    test.afterEach(async () => {
        await releaseOrderReservation(token, readE2eOrder().id);
    });

    test('confirming an order creates a reservation shown in the Reserve column', async ({
        page,
    }) => {
        await page.goto(`/orders/${readE2eOrder().code}`);
        const reserve = page.locator('.line-row td[data-label="Reserve"]').first();
        await expect(reserve).toContainText(/^\s*0 \/ \d+/, { timeout: 15000 });
        await page.getByRole('button', { name: 'Confirm order' }).click();
        await page.getByRole('button', { name: 'Confirm', exact: true }).click();

        await expect(reserve).toHaveText(/^\s*(\d+) \/ \1\s*$/);
        await page.getByRole('button', { name: 'More actions' }).click();
        await expect(page.getByRole('menuitem', { name: 'Release reservation' })).toBeVisible();
    });
});

test.describe('adding and deleting positions of the shared e2e order', () => {
    const SKU = 'E2E-OF-002';
    let token: string;

    async function removeAddedLine(): Promise<void> {
        const order = readE2eOrder();
        const found = await adminGql<{
            order: { lines: { id: string; productVariant: { sku: string } }[] };
        }>(
            `query($id: ID!) { order(id: $id) { lines { id productVariant { sku } } } }`,
            { id: order.id },
            token,
        );
        const extra = found.data.order.lines.find(l => l.productVariant.sku === SKU);
        if (!extra) return;
        await adminGql(
            `mutation($o: ID!, $l: ID!) { removeOrderLine(orderId: $o, orderLineId: $l) }`,
            { o: order.id, l: extra.id },
            token,
        );
    }

    test.beforeEach(async () => {
        token = await adminTokenFor(
            MANAGER_ACCOUNTS.operator.username,
            MANAGER_ACCOUNTS.operator.password,
        );
        await releaseOrderReservation(token, readE2eOrder().id);
        await removeAddedLine();
    });

    test.afterEach(async () => {
        await removeAddedLine();
    });

    async function addBySearch(page: Page, term: string): Promise<void> {
        await page.getByRole('button', { name: 'Add position' }).click({ timeout: 15000 });
        await page.getByLabel('Article or product name').fill(term);
        await page.getByRole('button', { name: new RegExp(SKU) }).click();
        await expect(page.getByLabel('Unit price', { exact: true })).toHaveCount(0);
        await expect(page.getByTestId('add-row-available')).not.toHaveText('—');
        await expect(page.getByLabel('Price', { exact: true })).not.toHaveValue('');
        await page.getByRole('button', { name: 'Add position', exact: true }).click();
    }

    test('a position is added by its article and deleted with the row trash button', async ({
        page,
    }) => {
        await page.goto(`/orders/${readE2eOrder().code}`);
        await addBySearch(page, SKU);

        const row = page.getByTestId(`order-line-${SKU}`);
        await expect(row).toBeVisible();

        await row.getByRole('button', { name: 'Delete position' }).click();
        await page
            .getByRole('dialog')
            .getByRole('button', { name: /^Delete 1 position/ })
            .click();
        await expect(row).toHaveCount(0);
    });

    test('the add row quantity is typeable and reverts an invalid entry on blur', async ({
        page,
    }) => {
        await page.goto(`/orders/${readE2eOrder().code}`);
        await page.getByRole('button', { name: 'Add position' }).click({ timeout: 15000 });
        const quantity = page.getByTestId('order-add-row').getByLabel('Quantity');
        await quantity.fill('abc');
        await expect(quantity).toHaveAttribute('aria-invalid', 'true');
        await quantity.blur();
        await expect(quantity).toHaveValue('1');
        await quantity.fill('3');
        await expect(quantity).toHaveValue('3');
        await page.getByRole('button', { name: 'Cancel adding' }).click();
    });

    test('selected positions are deleted in bulk with a confirmation', async ({ page }) => {
        await page.goto(`/orders/${readE2eOrder().code}`);
        await addBySearch(page, SKU);
        const row = page.getByTestId(`order-line-${SKU}`);
        await expect(row).toBeVisible();

        await row.getByRole('checkbox').check();
        await expect(page.getByTestId('doc-selected-count')).toHaveText('Selected: 1');
        await page.getByTestId('doc-selection-bar').getByRole('button', { name: 'Delete' }).click();
        await page
            .getByRole('dialog')
            .getByRole('button', { name: /^Delete 1 position/ })
            .click();
        await expect(row).toHaveCount(0);
    });
});
