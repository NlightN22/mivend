import { TEST_TIMEOUT_MS } from '../../timeouts';
import { test, expect, type Page } from '@playwright/test';
import { gql } from '../orders/helpers';
import {
    CREDIT_BUYER,
    PREPAY_BUYER,
    addSku,
    orderWithReservation,
    adminOrder,
    cancelOpenOrders,
    loginBuyer,
    waitForCheckoutReady,
} from './helpers';

test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(TEST_TIMEOUT_MS.standard);

async function openCheckout(page: Page, email: string): Promise<void> {
    await loginBuyer(page, email);
    await addSku(page, 'E2E-FLT-001', 1);
    await page.goto('/checkout');
    await waitForCheckoutReady(page);
}

async function orderCodeFromUrl(page: Page): Promise<string> {
    await expect(page).toHaveURL(/\/order-created\?code=/, { timeout: 20000 });
    return new URL(page.url()).searchParams.get('code') as string;
}

for (const email of [CREDIT_BUYER, PREPAY_BUYER]) {
    test.describe(`checkout within limit: ${email}`, () => {
        test.beforeEach(async () => {
            await cancelOpenOrders(email);
        });
        test.afterEach(async () => {
            await cancelOpenOrders(email);
        });

        test('cash is placed and waits for the manager to confirm receipt', async ({ page }) => {
            await openCheckout(page, email);
            await page.getByRole('button', { name: /^Cash/i }).click();
            await page.getByRole('button', { name: 'Place order' }).click();
            const code = await orderCodeFromUrl(page);
            await expect(
                page.getByText(/Waiting for the manager to confirm/).first(),
            ).toBeVisible();

            const order = await orderWithReservation(code, 'RESERVED');
            expect(order.payments[0].method).toBe('cash');
            expect(order.payments[0].state).toBe('Authorized');
            expect(order.reservationState).toBe('RESERVED');
            const placement = order.payments[0].metadata.placement as { route: string };
            expect(placement.route).toBe('erp-now');
        });

        test('bank transfer creates a proforma, offers a print link and reserves', async ({
            page,
        }) => {
            await openCheckout(page, email);
            await page.getByRole('button', { name: /Bank proforma invoice/i }).click();
            await page.getByRole('button', { name: 'Place order & get proforma invoice' }).click();
            const code = await orderCodeFromUrl(page);
            await expect(
                page.getByRole('link', { name: /Print proforma invoice/ }).first(),
            ).toBeVisible();

            const order = await orderWithReservation(code, 'RESERVED');
            expect(order.payments[0].method).toBe('offline-terms');
            expect(order.payments[0].state).toBe('Authorized');
            expect(order.reservationState).toBe('RESERVED');
            const list = (await gql(
                page,
                `query($c: String!) { myProformaInvoices(options: { orderCode: $c }) { items { status } } }`,
                { c: code },
            )) as { myProformaInvoices: { items: { status: string }[] } };
            expect(list.myProformaInvoices.items).toHaveLength(1);
            expect(list.myProformaInvoices.items[0].status).toBe('issued');
        });

        test('card goes to the payment page and a successful stub settles the order', async ({
            page,
        }) => {
            await openCheckout(page, email);
            await page.getByRole('button', { name: /Card online/i }).click();
            await expect(page.getByText('To pay online')).toBeVisible();
            await page.getByRole('button', { name: /^Pay .* →$/ }).click();
            await expect(page).toHaveURL(/\/payment-stub/, { timeout: 15000 });
            await page.getByRole('button', { name: /Payment successful/i }).click();
            await expect(page).toHaveURL(/\/payment-result\?status=success/, { timeout: 15000 });

            const data = (await gql(
                page,
                `{ myOrders(options: { take: 1 }) { items { code state } } }`,
            )) as {
                myOrders: { items: { code: string; state: string }[] };
            };
            const latest = data.myOrders.items[0];
            expect(latest.state).toBe('PaymentSettled');
            const order = await adminOrder(latest.code);
            expect(order.payments[0].method).toBe('online-stub');
            expect(order.payments[0].state).toBe('Settled');
        });
    });
}
