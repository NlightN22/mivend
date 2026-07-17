import { test, expect, type Page } from '@playwright/test';
import { adminGql } from '../../helpers/api';
import { gql } from '../orders/helpers';
import { buildOrderAcrossOrganizations, myInvoicesForOrder } from '../invoices/helpers';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const SUPERADMIN = {
    identifier: process.env.SUPERADMIN_USERNAME ?? 'superadmin',
    password: process.env.SUPERADMIN_PASSWORD ?? 'superadmin',
};

async function postErpPaymentCallback(
    invoiceId: string,
    outcome: 'success' | 'pending' | 'fail' | 'cancel',
    erpEventId: string,
): Promise<void> {
    const res = await fetch(`${SERVER_URL}/erp/callback/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: Number(invoiceId), outcome, erpEventId }),
    });
    if (!res.ok) {
        throw new Error(`ERP payment callback failed: ${res.status} ${await res.text()}`);
    }
}

// The real periodic worker only sweeps once a minute (paymentInboxPollIntervalMs) — too slow for
// a test. triggerPaymentInboxSweep runs the exact same InboxService.claimBatch /
// PaymentInboxProcessorService path on demand (an ops "run now" trigger, not a bypass of the
// async contract — see AGENTS.md sync rule #12) so the test doesn't need to wait or poll.
async function triggerSweep(): Promise<{ processed: number; failed: number }> {
    const { token } = await adminGql<{ login: { __typename: string } }>(
        `mutation($u: String!, $p: String!) { login(username: $u, password: $p) { __typename } }`,
        { u: SUPERADMIN.identifier, p: SUPERADMIN.password },
    );
    const { data } = await adminGql<{
        triggerPaymentInboxSweep: { processed: number; failed: number };
    }>(`mutation { triggerPaymentInboxSweep { processed failed } }`, undefined, token);
    return data.triggerPaymentInboxSweep;
}

async function createOpenInvoice(page: Page): Promise<{ invoiceId: string; orderCode: string }> {
    await buildOrderAcrossOrganizations(page);
    const orderData = await gql(page, `query { activeOrder { code } }`);
    const orderCode = (orderData.activeOrder as { code: string }).code;
    await gql(
        page,
        `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename } }`,
    );
    const [invoice] = await myInvoicesForOrder(page, orderCode);
    return { invoiceId: invoice.id, orderCode };
}

test.describe('ERP payment callback (bank-transfer-erp inbox flow)', () => {
    test('a real callback flows through EventBus + inbox + worker sweep and pays the invoice', async ({
        page,
    }) => {
        const { invoiceId } = await createOpenInvoice(page);
        const erpEventId = `e2e-erp-${invoiceId}-${Date.now()}`;

        await postErpPaymentCallback(invoiceId, 'success', erpEventId);
        const { processed } = await triggerSweep();
        expect(processed).toBeGreaterThanOrEqual(1);

        const invoiceResult = await gql(page, `query($id: ID!) { invoice(id: $id) { status } }`, {
            id: invoiceId,
        });
        expect((invoiceResult.invoice as { status: string }).status).toBe('paid');

        await page.goto('/payments');
        await page.waitForLoadState('domcontentloaded');
        const row = page.locator('.payment-row', { hasText: `Invoice #${invoiceId}` }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await expect(row).toContainText('Bank transfer (ERP)');
        await expect(row).toContainText('Succeeded');
    });

    test('posting the same erpEventId twice does not double-pay or double-allocate', async ({
        page,
    }) => {
        const { invoiceId } = await createOpenInvoice(page);
        const erpEventId = `e2e-erp-dup-${invoiceId}-${Date.now()}`;

        await postErpPaymentCallback(invoiceId, 'success', erpEventId);
        await postErpPaymentCallback(invoiceId, 'success', erpEventId);
        await triggerSweep();

        const invoiceResult = await gql(page, `query($id: ID!) { invoice(id: $id) { status } }`, {
            id: invoiceId,
        });
        expect((invoiceResult.invoice as { status: string }).status).toBe('paid');

        const paymentsResult = await gql(
            page,
            `query { myPayments(options: { take: 200 }) { items { id invoiceId } } }`,
        );
        const matches = (
            paymentsResult.myPayments as { items: { id: string; invoiceId: string | null }[] }
        ).items.filter(i => i.invoiceId === invoiceId);
        expect(matches.length).toBe(1);
    });
});
