import { TEST_TIMEOUT_MS } from '../../timeouts';
import { test, expect, type Page } from '@playwright/test';
import {
    CREDIT_BUYER,
    addSku,
    boostStock,
    OVER_LIMIT_CART,
    orderWithReservation,
    adminOrder,
    cancelOpenOrders,
    creditPreview,
    defaultBranchSettings,
    fillCartOverLimit,
    loginBuyer,
    placeViaApi,
    setAllowExceeding,
    type BranchSettingsSnapshot,
    waitForCheckoutReady,
} from './helpers';

test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(TEST_TIMEOUT_MS.checkoutLong);

let base: BranchSettingsSnapshot;

test.beforeAll(async () => {
    base = await defaultBranchSettings();
    await boostStock(OVER_LIMIT_CART.map(([sku]) => sku));
});
test.beforeEach(async () => {
    await cancelOpenOrders(CREDIT_BUYER);
});
test.afterEach(async () => {
    await cancelOpenOrders(CREDIT_BUYER);
});
test.afterAll(async () => {
    await setAllowExceeding(base, base.allowExceedingCreditLimit);
});

async function overLimitCheckout(page: Page): Promise<void> {
    await loginBuyer(page, CREDIT_BUYER);
    await fillCartOverLimit(page);
    await page.goto('/checkout');
    await waitForCheckoutReady(page);
}

test.describe('over the credit limit', () => {
    test('allow ON + acknowledgement: cash goes to reservation without the manager', async ({
        page,
    }) => {
        await setAllowExceeding(base, true);
        await overLimitCheckout(page);
        await page.getByRole('button', { name: /^Cash/i }).click();
        await expect(page.getByText('I understand the limit is exceeded')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Place order' })).toBeDisabled();
        await page.getByText('I understand the limit is exceeded').click();
        await page.getByRole('button', { name: 'Place order' }).click();
        await expect(page).toHaveURL(/\/order-created\?code=/, { timeout: 20000 });
        const code = new URL(page.url()).searchParams.get('code') as string;

        const order = await orderWithReservation(code, 'RESERVED');
        expect(order.reservationState).toBe('RESERVED');
        const meta = order.payments[0].metadata as {
            placement: { route: string };
            public: { creditLimitExceeded: boolean; awaitingManagerConfirmation: boolean };
        };
        expect(meta.placement.route).toBe('erp-now');
        expect(meta.public.creditLimitExceeded).toBe(true);
        expect(meta.public.awaitingManagerConfirmation).toBe(false);
    });

    test('allow OFF: the warning is shown and the order waits for the manager', async ({
        page,
    }) => {
        await setAllowExceeding(base, false);
        await overLimitCheckout(page);
        await page.getByRole('button', { name: /^Cash/i }).click();
        await expect(page.getByText(/will wait for your manager to confirm/)).toBeVisible();
        await page.getByText('I understand the limit is exceeded').click();
        await page.getByRole('button', { name: 'Place order' }).click();
        await expect(page).toHaveURL(/\/order-created\?code=/, { timeout: 20000 });
        await expect(page.getByText(/wait for your manager to confirm/)).toBeVisible();
        const code = new URL(page.url()).searchParams.get('code') as string;

        const order = await orderWithReservation(code, 'AWAITING_CONFIRMATION');
        expect(order.reservationState).toBe('AWAITING_CONFIRMATION');
        expect((order.payments[0].metadata.placement as { route: string }).route).toBe(
            'manager-confirmation',
        );
    });

    test('bypass: allow ON but no acknowledgement via API still waits for the manager', async ({
        page,
    }) => {
        await setAllowExceeding(base, true);
        await loginBuyer(page, CREDIT_BUYER);
        await fillCartOverLimit(page);
        const result = await placeViaApi(page, 'cash');
        expect(result.typename).toBe('Order');
        const order = await orderWithReservation(result.code as string, 'AWAITING_CONFIRMATION');
        expect(order.reservationState).toBe('AWAITING_CONFIRMATION');
        expect((order.payments[0].metadata.placement as { route: string }).route).toBe(
            'manager-confirmation',
        );
    });

    test('card over the limit pays excess + total and the order is cured', async ({ page }) => {
        await setAllowExceeding(base, true);
        await loginBuyer(page, CREDIT_BUYER);
        await fillCartOverLimit(page);
        const first = await placeViaApi(page, 'cash', { creditLimitAcknowledged: true });
        expect(first.typename).toBe('Order');

        await addSku(page, 'E2E-FLT-001', 1);
        const preview = await creditPreview(page);
        expect(preview.payableCardAmount).toBeGreaterThan(preview.orderAmount);

        await page.goto('/checkout');
        await waitForCheckoutReady(page);
        await page.getByRole('button', { name: /Card online/i }).click();
        await expect(page.getByText(/debt above your credit limit/)).toBeVisible();
        await page.getByRole('button', { name: /^Pay .* →$/ }).click();
        await expect(page).toHaveURL(/\/payment-stub/, { timeout: 15000 });
        await page.getByRole('button', { name: /Payment successful/i }).click();
        await expect(page).toHaveURL(/\/payment-result\?status=success/, { timeout: 15000 });

        const second = await page.evaluate(async () => {
            const r = await fetch('/shop-api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: '{ myOrders(options: { take: 1 }) { items { code } } }',
                }),
            });
            return (await r.json()).data.myOrders.items[0].code as string;
        });
        const order = await adminOrder(second);
        expect(order.state).toBe('PaymentSettled');
        const payment = order.payments[0];
        expect(payment.state).toBe('Settled');
        expect(payment.amount).toBe(Math.round(preview.payableCardAmount * 100));
        expect(
            (payment.metadata.public as { creditLimitExceeded: boolean }).creditLimitExceeded,
        ).toBe(false);
    });
});
