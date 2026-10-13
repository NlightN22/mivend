import { test, expect } from '@playwright/test';
import { gql } from '../orders/helpers';
import {
    CREDIT_BUYER,
    PREPAY_BUYER,
    addSku,
    admin,
    adminOrder,
    cancelOpenOrders,
    creditPreview,
    loginBuyer,
    placeViaApi,
} from './helpers';

test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(60000);

test.beforeEach(async () => {
    await cancelOpenOrders(CREDIT_BUYER);
    await cancelOpenOrders(PREPAY_BUYER);
});
test.afterEach(async () => {
    await cancelOpenOrders(CREDIT_BUYER);
    await cancelOpenOrders(PREPAY_BUYER);
});

test.describe('checkout negative paths', () => {
    test('a stale expected card amount is declined with CARD_AMOUNT_CHANGED', async ({ page }) => {
        await loginBuyer(page, CREDIT_BUYER);
        await addSku(page, 'E2E-FLT-001', 1);
        const preview = await creditPreview(page);
        const result = await placeViaApi(page, 'online-stub', {
            status: 'success',
            expectedAmountKopecks: Math.round(preview.payableCardAmount * 100) + 100,
        });
        expect(result.typename).not.toBe('Order');
        expect(result.message).toContain('CARD_AMOUNT_CHANGED');
    });

    test('the UI re-confirms when the server sees a different amount', async ({ page }) => {
        await loginBuyer(page, CREDIT_BUYER);
        await addSku(page, 'E2E-FLT-001', 1);
        await page.goto('/checkout');
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: /Card online/i }).click();
        await page.getByRole('button', { name: /^Pay .* →$/ }).click();
        await expect(page).toHaveURL(/\/payment-stub/, { timeout: 15000 });
        // Simulates the total changing after the amount was displayed.
        await page.route('**/shop-api', async route => {
            const body = route.request().postDataJSON() as {
                variables?: { status?: { expectedAmountKopecks?: number } };
            };
            if (body.variables?.status?.expectedAmountKopecks !== undefined) {
                body.variables.status.expectedAmountKopecks += 100;
            }
            await route.continue({ postData: JSON.stringify(body) });
        });
        await page.getByRole('button', { name: /Payment successful/i }).click();
        await expect(page).toHaveURL(/\/checkout/, { timeout: 15000 });
        const data = (await gql(
            page,
            `{ myOrders(options: { take: 1 }) { items { state } } }`,
        )) as {
            myOrders: { items: { state: string }[] };
        };
        expect(data.myOrders.items[0]?.state).not.toBe('PaymentSettled');
    });

    test('an unknown payment method is rejected', async ({ page }) => {
        await loginBuyer(page, PREPAY_BUYER);
        await addSku(page, 'E2E-FLT-001', 1);
        await expect(placeViaApi(page, 'no-such-method')).rejects.toThrow(
            /payment-method-not-found/,
        );
    });

    test('confirmPaymentReceived is idempotent for cash and refused for card', async ({ page }) => {
        await loginBuyer(page, PREPAY_BUYER);
        await addSku(page, 'E2E-FLT-001', 1);
        const cash = await placeViaApi(page, 'cash');
        const cashOrder = await adminOrder(cash.code as string);
        const confirm = `mutation($o: ID!) { confirmPaymentReceived(orderId: $o) { id state } }`;
        const first = await admin<{ confirmPaymentReceived: { state: string } }>(confirm, {
            o: cashOrder.id,
        });
        const second = await admin<{ confirmPaymentReceived: { state: string } }>(confirm, {
            o: cashOrder.id,
        });
        expect(first.confirmPaymentReceived.state).toBe('PaymentSettled');
        expect(second.confirmPaymentReceived.state).toBe('PaymentSettled');
        const settled = await adminOrder(cash.code as string);
        expect(settled.payments.filter(p => p.state === 'Settled')).toHaveLength(1);

        await addSku(page, 'E2E-FLT-001', 1);
        const preview = await creditPreview(page);
        const card = await placeViaApi(page, 'online-stub', {
            status: 'pending',
            expectedAmountKopecks: Math.round(preview.payableCardAmount * 100),
        });
        const cardOrder = await adminOrder(card.code as string);
        await expect(admin(confirm, { o: cardOrder.id })).rejects.toThrow();
        const after = await adminOrder(card.code as string);
        expect(after.payments.some(p => p.state === 'Settled')).toBe(false);
    });

    test('a bank transfer is not settled by merely requesting its proforma', async ({ page }) => {
        await loginBuyer(page, PREPAY_BUYER);
        await addSku(page, 'E2E-FLT-001', 1);
        const placed = await placeViaApi(page, 'offline-terms');
        await gql(page, `mutation($c: String!) { requestProformaInvoices(orderCode: $c) { id } }`, {
            c: placed.code,
        });
        const order = await adminOrder(placed.code as string);
        expect(order.payments[0].state).toBe('Authorized');
    });
});
