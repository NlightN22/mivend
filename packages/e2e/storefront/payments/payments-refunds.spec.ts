import { test, expect, type Page } from '@playwright/test';
import { gql } from '../orders/helpers';
import { adminGql } from '../../helpers/api';
import { buildOrderAcrossOrganizations, myInvoicesForOrder, payInvoice } from '../invoices/helpers';

async function buildCapturedOnlinePayment(
    page: Page,
): Promise<{ paymentId: string; invoiceId: string }> {
    await buildOrderAcrossOrganizations(page);
    const orderData = await gql(page, `query { activeOrder { code } }`);
    const orderCode = (orderData.activeOrder as { code: string }).code;
    await gql(
        page,
        `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename } }`,
    );
    const [invoice] = await myInvoicesForOrder(page, orderCode);
    await payInvoice(page, invoice.id, 'success', 'online-acquiring');

    const result = await gql(
        page,
        `query { myPayments(options: { take: 200 }) { items { id invoiceId } } }`,
    );
    const items = (result.myPayments as { items: { id: string; invoiceId: string | null }[] })
        .items;
    const match = items.find(i => i.invoiceId === invoice.id);
    if (!match) throw new Error(`No payment found for invoice ${invoice.id}`);
    return { paymentId: match.id, invoiceId: invoice.id };
}

async function adminToken(): Promise<string> {
    const login = await adminGql<{ login: { __typename: string } }>(
        `mutation($u: String!, $p: String!) { login(username: $u, password: $p) { __typename } }`,
        { u: 'superadmin', p: 'superadmin' },
    );
    return login.token!;
}

test.describe('Payment detail page — refunds and disputes', () => {
    test('a payment with a recorded refund shows its amount, status and provider reference', async ({
        page,
    }) => {
        const { paymentId } = await buildCapturedOnlinePayment(page);
        const token = await adminToken();
        await adminGql(
            `mutation($paymentId: ID!, $amount: Int!, $reason: String!, $providerRefundId: String, $status: String) {
                recordPaymentRefund(paymentId: $paymentId, amount: $amount, reason: $reason, providerRefundId: $providerRefundId, status: $status) { id }
            }`,
            {
                paymentId,
                amount: 500,
                reason: 'Customer requested refund',
                providerRefundId: '48213999',
                status: 'succeeded',
            },
            token,
        );

        await page.goto(`/payments/${paymentId}`);
        await page.waitForLoadState('domcontentloaded');
        const card = page.locator('.pd-card', { hasText: 'Refunds and disputes' });
        await expect(card).toBeVisible({ timeout: 10000 });
        await expect(card).toContainText('48213999');
        await expect(card).toContainText('succeeded');
        await expect(card).toContainText('Customer requested refund');
    });

    test('a payment with a recorded dispute shows its type and status', async ({ page }) => {
        const { paymentId } = await buildCapturedOnlinePayment(page);
        const token = await adminToken();
        await adminGql(
            `mutation($paymentId: ID!, $type: String!, $amount: Int!, $status: String) {
                recordPaymentDispute(paymentId: $paymentId, type: $type, amount: $amount, status: $status) { id }
            }`,
            { paymentId, type: 'chargeback', amount: 500, status: 'opened' },
            token,
        );

        await page.goto(`/payments/${paymentId}`);
        await page.waitForLoadState('domcontentloaded');
        const card = page.locator('.pd-card', { hasText: 'Refunds and disputes' });
        await expect(card).toBeVisible({ timeout: 10000 });
        await expect(card).toContainText('chargeback');
        await expect(card).toContainText('opened');
    });

    test('a payment with no refunds or disputes shows the empty state, not fabricated rows', async ({
        page,
    }) => {
        const { paymentId } = await buildCapturedOnlinePayment(page);

        await page.goto(`/payments/${paymentId}`);
        await page.waitForLoadState('domcontentloaded');
        const card = page.locator('.pd-card', { hasText: 'Refunds and disputes' });
        await expect(card).toBeVisible({ timeout: 10000 });
        await expect(card).toContainText(
            'No refunds, chargebacks or disputes have been registered',
        );
        await expect(card.locator('table')).toHaveCount(0);
    });

    test('a bank-transfer-erp payment shows the honest "no automated refund path" note instead of a refund UI', async ({
        page,
    }) => {
        await buildOrderAcrossOrganizations(page);
        const orderData = await gql(page, `query { activeOrder { code } }`);
        const orderCode = (orderData.activeOrder as { code: string }).code;
        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename } }`,
        );
        const [invoice] = await myInvoicesForOrder(page, orderCode);
        await payInvoice(page, invoice.id, 'success', 'bank-transfer-erp');

        const result = await gql(
            page,
            `query { myPayments(options: { take: 200 }) { items { id invoiceId } } }`,
        );
        const items = (result.myPayments as { items: { id: string; invoiceId: string | null }[] })
            .items;
        const match = items.find(i => i.invoiceId === invoice.id);
        if (!match) throw new Error(`No payment found for invoice ${invoice.id}`);

        await page.goto(`/payments/${match.id}`);
        await page.waitForLoadState('domcontentloaded');
        const card = page.locator('.pd-card', { hasText: 'Refunds and disputes' });
        await expect(card).toBeVisible({ timeout: 10000 });
        await expect(card).toContainText('no automated refund path');
    });

    // External reference is now mandatory for every channel — the real branch-kassa RRN/kassa
    // receipt only arrives via the branch→central sync transport (recordWitnessedPayment →
    // outbox → RabbitMQ → central.consumer.ts's BranchKassaPaymentEvent), and a fact missing it
    // gets dead-lettered rather than silently processed (plugin-acquiring's
    // payment-inbox.int.test.ts covers that rejection). The manually-triggered payInvoice
    // mutation (the only branch-kassa path reachable from this e2e suite without standing up a
    // second instance) has no real RRN to pass, so the server generates a structured stub
    // reference instead of leaving the field empty — this confirms the UI shows that real,
    // non-fabricated-looking stub value, never a blank "—".
    test('a branch-kassa payment paid via the manual mutation shows a real (stub) external reference, never blank', async ({
        page,
    }) => {
        await buildOrderAcrossOrganizations(page);
        const orderData = await gql(page, `query { activeOrder { code } }`);
        const orderCode = (orderData.activeOrder as { code: string }).code;
        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename } }`,
        );
        const [invoice] = await myInvoicesForOrder(page, orderCode);
        await payInvoice(page, invoice.id, 'success', 'branch-kassa');

        const result = await gql(
            page,
            `query { myPayments(options: { take: 200 }) { items { id invoiceId } } }`,
        );
        const items = (result.myPayments as { items: { id: string; invoiceId: string | null }[] })
            .items;
        const match = items.find(i => i.invoiceId === invoice.id);
        if (!match) throw new Error(`No payment found for invoice ${invoice.id}`);

        await page.goto(`/payments/${match.id}`);
        await page.waitForLoadState('domcontentloaded');
        const row = page.locator('.pd-detail-row', { hasText: 'External reference' });
        await expect(row).toBeVisible({ timeout: 10000 });
        await expect(row).not.toContainText('—');
        await expect(row).toContainText(`STUB-branch-kassa-${invoice.id}`);
    });
});
