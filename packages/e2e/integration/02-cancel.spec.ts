import { keepCustomerSession } from './customer-session';
import { test, expect, type Page } from '@playwright/test';
import { loginAsManager } from '../helpers/manager-auth';
import { pickMixedCart } from './cart-picker';
import { loadContourEnv } from './contour-env';
import {
    ERP_ANSWER_TIMEOUT_MS,
    placedOrder,
    waitForErpAnswer,
    waitForInbox,
    waitForOrder,
    waitForPublished,
} from './erp-wait';
import { orderByCode, reservations, type OrderRow } from './order-rows';
import { cancelInStorefront, fillCart, placeOrderInCheckout } from './storefront-flow';
import { readRun } from './run-state';

test.describe.configure({ timeout: 30 * 60_000 });
keepCustomerSession();

const CANCEL_RESULT_TIMEOUT_MS = ERP_ANSWER_TIMEOUT_MS;

async function placeSmallOrder(page: Page): Promise<OrderRow> {
    const { lines } = await pickMixedCart(page);
    await fillCart(page, lines.slice(0, 1));
    const order = await placedOrder(await placeOrderInCheckout(page));
    await waitForPublished(order.uuid, 'order.confirmed');
    return registered(order);
}

async function registered(order: OrderRow): Promise<OrderRow> {
    await waitForErpAnswer('order-registration-result', order.uuid);
    const row = await waitForOrder(order.code, o => !!o.erpOrderId);
    expect(row?.erpOrderId, `order ${order.code} registered in the ERP`).toBeTruthy();
    return row as OrderRow;
}

async function expectCancelled(order: OrderRow): Promise<void> {
    const requested = await waitForPublished(order.uuid, 'order.cancel-requested');
    expect(requested.filter(r => r.status === 'published')).toHaveLength(1);
    const result = await waitForInbox('order-cancel-result', order.uuid, CANCEL_RESULT_TIMEOUT_MS);
    const final = await waitForOrder(
        order.code,
        o => o.state === 'Cancelled',
        CANCEL_RESULT_TIMEOUT_MS,
    );
    expect(final?.state).toBe('Cancelled');
    expect(reservations(order.id).filter(r => r.status === 'active')).toEqual([]);
    expect(result, 'order-cancel-result recorded').toBeTruthy();
}

test('4: cancel from the storefront: one cancel-requested, cancel result recorded, Cancelled, released', async ({
    page,
}) => {
    const first = readRun().orders[0];
    const current = first ? orderByCode(first.code) : undefined;
    const order =
        current && current.state !== 'Cancelled'
            ? await registered(current)
            : await placeSmallOrder(page);
    await cancelInStorefront(page, order.id);
    await expect(page.getByText('Отмена запрошена')).toBeVisible();
    await expectCancelled(orderByCode(order.code) as OrderRow);
});

test('4: cancel from the manager portal: one cancel-requested, cancel result recorded, Cancelled, released', async ({
    page,
    browser,
}) => {
    const { manager, managerUrl } = loadContourEnv();
    if (!manager) {
        test.skip(
            true,
            'STAGING_TEST_MANAGER_USERNAME/PASSWORD are not set in the staging-integration env file',
        );
        return;
    }
    const order = await placeSmallOrder(page);
    const context = await browser.newContext({
        baseURL: managerUrl,
        storageState: undefined,
        userAgent: await page.evaluate(() => navigator.userAgent),
    });
    const staff = await context.newPage();
    try {
        await loginAsManager(staff, manager.username, manager.password);
        await staff.goto(`/orders/${order.code}`);
        await staff.getByRole('button', { name: 'Cancel order' }).click();
        await staff.getByRole('button', { name: 'Yes, cancel' }).click();
        await expect(staff.getByRole('button', { name: 'Cancel order' })).toBeHidden({
            timeout: 30_000,
        });
    } finally {
        await context.close();
    }
    await expectCancelled(orderByCode(order.code) as OrderRow);
});
