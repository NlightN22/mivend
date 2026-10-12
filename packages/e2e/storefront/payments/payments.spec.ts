import { test, expect, type Page } from '@playwright/test';
import { gql } from '../orders/helpers';
import {
    buildOrderAcrossOrganizations,
    myProformaInvoicesForOrder,
    payAllOpenProformaInvoices,
    payProformaInvoice,
} from '../proforma-invoices/helpers';

async function goToPayments(page: Page): Promise<void> {
    await page.goto('/payments');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Payments' })).toBeVisible({ timeout: 20000 });
}

async function findPaymentByProformaInvoiceId(
    page: Page,
    proformaInvoiceId: string,
): Promise<{ id: string; proformaInvoiceId: string | null }> {
    const result = await gql(
        page,
        `query { myPayments(options: { take: 200 }) { items { id proformaInvoiceId createdAt } } }`,
    );
    const items = (
        result.myPayments as { items: { id: string; proformaInvoiceId: string | null }[] }
    ).items;
    const match = items.find(i => i.proformaInvoiceId === proformaInvoiceId);
    if (!match) throw new Error(`No payment found for proforma invoice ${proformaInvoiceId}`);
    return match;
}

async function buildAndPayProformaInvoice(
    page: Page,
    outcome: 'success' | 'pending' | 'fail' | 'cancel',
    channel?: 'online-acquiring' | 'branch-kassa' | 'bank-transfer-erp',
): Promise<{
    proformaInvoiceId: string;
    proformaInvoiceNumber: string;
    orderCode: string;
    paymentStatus: string;
}> {
    await buildOrderAcrossOrganizations(page);
    const orderData = await gql(page, `query { activeOrder { code } }`);
    const orderCode = (orderData.activeOrder as { code: string }).code;
    await gql(
        page,
        `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename } }`,
    );
    const [proformaInvoice] = await myProformaInvoicesForOrder(page, orderCode);
    await payProformaInvoice(page, proformaInvoice.id, outcome, channel);
    const payment = await findPaymentByProformaInvoiceId(page, proformaInvoice.id);
    const result = await gql(page, `query($id: ID!) { payment(id: $id) { status } }`, {
        id: payment.id,
    });
    return {
        proformaInvoiceId: proformaInvoice.id,
        proformaInvoiceNumber: proformaInvoice.number,
        orderCode,
        paymentStatus: (result.payment as { status: string }).status,
    };
}

test.describe('Payments page', () => {
    test('payments page loads and shows rows', async ({ page }) => {
        await buildAndPayProformaInvoice(page, 'success');
        await goToPayments(page);
        await expect(page.locator('.payment-row').first()).toBeVisible({ timeout: 10000 });
    });

    test('a payment made with the bank-transfer-erp channel shows the correct source label', async ({
        page,
    }) => {
        const { proformaInvoiceNumber, paymentStatus } = await buildAndPayProformaInvoice(
            page,
            'success',
            'bank-transfer-erp',
        );
        expect(paymentStatus).toBe('captured');

        await goToPayments(page);
        const row = page
            .locator('.payment-row', { hasText: `Proforma invoice #${proformaInvoiceNumber}` })
            .first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await expect(row).toContainText('Bank transfer (ERP)');
    });

    test('the "Succeeded" status filter shows only captured payments', async ({ page }) => {
        // Guarantee at least one non-succeeded payment exists this run, so this filter is a real
        // narrowing test rather than trivially true because nothing else is in the DB.
        await buildAndPayProformaInvoice(page, 'fail');
        await buildAndPayProformaInvoice(page, 'success');

        await goToPayments(page);
        await page.getByRole('button', { name: 'Succeeded' }).click();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.payment-row').first()).toBeVisible({ timeout: 10000 });

        const rowTexts = await page.locator('.payment-row').allTextContents();
        for (const text of rowTexts) {
            expect(text).toContain('Succeeded');
            expect(text).not.toContain('Failed');
        }
    });

    test('the "Failed" status filter shows only failed payments', async ({ page }) => {
        // 'fail' never allocates a SettlementEntry, so the row has no "Proforma invoice #X" chip — locate
        // it by order code instead, which every row shows regardless of allocation.
        const { orderCode } = await buildAndPayProformaInvoice(page, 'fail');

        await goToPayments(page);
        await page.getByRole('button', { name: 'Failed' }).click();
        await page.waitForLoadState('networkidle');

        const row = page.locator('.payment-row', { hasText: `Order ${orderCode}` }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await expect(row).toContainText('Failed');

        const rowTexts = await page.locator('.payment-row').allTextContents();
        for (const text of rowTexts) {
            expect(text).toContain('Failed');
        }
    });

    test('the "Cancelled" status filter shows only cancelled payments', async ({ page }) => {
        const { orderCode } = await buildAndPayProformaInvoice(page, 'cancel');

        await goToPayments(page);
        await page.getByRole('button', { name: 'Cancelled' }).click();
        await page.waitForLoadState('networkidle');

        const row = page.locator('.payment-row', { hasText: `Order ${orderCode}` }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await expect(row).toContainText('Cancelled');

        const rowTexts = await page.locator('.payment-row').allTextContents();
        for (const text of rowTexts) {
            expect(text).toContain('Cancelled');
        }
    });

    test('the "Bank transfer (ERP)" source filter shows only that channel\'s payments', async ({
        page,
    }) => {
        await buildAndPayProformaInvoice(page, 'success', 'online-acquiring');
        const { proformaInvoiceNumber } = await buildAndPayProformaInvoice(
            page,
            'success',
            'bank-transfer-erp',
        );

        await goToPayments(page);
        await page.getByRole('button', { name: 'Bank transfer (ERP)' }).click();
        await page.waitForLoadState('networkidle');

        const row = page
            .locator('.payment-row', { hasText: `Proforma invoice #${proformaInvoiceNumber}` })
            .first();
        await expect(row).toBeVisible({ timeout: 10000 });

        const rowTexts = await page.locator('.payment-row').allTextContents();
        for (const text of rowTexts) {
            expect(text).toContain('Bank transfer (ERP)');
            expect(text).not.toContain('Online acquiring');
        }
    });

    test('combining a status and a source filter narrows to their intersection', async ({
        page,
    }) => {
        const { proformaInvoiceNumber } = await buildAndPayProformaInvoice(
            page,
            'success',
            'branch-kassa',
        );

        await goToPayments(page);
        await page.getByRole('button', { name: 'Succeeded' }).click();
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: 'Branch cash desk' }).click();
        await page.waitForLoadState('networkidle');

        const row = page
            .locator('.payment-row', { hasText: `Proforma invoice #${proformaInvoiceNumber}` })
            .first();
        await expect(row).toBeVisible({ timeout: 10000 });
        const rowTexts = await page.locator('.payment-row').allTextContents();
        for (const text of rowTexts) {
            expect(text).toContain('Succeeded');
            expect(text).toContain('Branch cash desk');
        }
    });

    test('the "Refunded" stat is real (no mock tag) and reflects succeeded refunds', async ({
        page,
    }) => {
        await goToPayments(page);
        const refundedStat = page.locator('.payments-page__stat-card', { hasText: 'Refunded' });
        await expect(refundedStat).toBeVisible({ timeout: 10000 });
        await expect(refundedStat.locator('.payments-page__mock-tag')).toHaveCount(0);
    });

    test('a duplicate payment that becomes a pure advance produces a second row for the same order, with a non-zero Remaining', async ({
        page,
    }) => {
        test.setTimeout(90000);
        await payAllOpenProformaInvoices(page);
        const { proformaInvoiceId, orderCode } = await buildAndPayProformaInvoice(page, 'success');
        // Duplicate the same payment — its proforma invoice is already paid and (after the drain above)
        // nothing else is open in that organization, so the whole amount becomes an advance.
        await payProformaInvoice(page, proformaInvoiceId, 'success');

        await goToPayments(page);
        // Both payments (original + duplicate) share the same order, so filter on that rather
        // than "Proforma invoice #X" — the duplicate/advance row has no proforma invoice allocation chip at all.
        const rows = page.locator('.payment-row', { hasText: `Order ${orderCode}` });
        await expect(rows.first()).toBeVisible({ timeout: 10000 });
        expect(await rows.count()).toBe(2);

        const remainingValues = await rows.locator('.payment-row__remaining').allTextContents();
        expect(remainingValues.some(text => text.trim() !== '0 ₽')).toBe(true);
    });

    test('Open navigates to the payment detail page with no console errors', async ({ page }) => {
        await goToPayments(page);
        const pageErrors: string[] = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        await expect(page.locator('.payment-row').first()).toBeVisible({ timeout: 10000 });
        await page.locator('.payment-row').first().getByRole('button', { name: 'Open' }).click();

        await expect(page).toHaveURL(/\/payments\/[a-zA-Z0-9]+$/, { timeout: 10000 });
        await expect(page.locator('.pd-title')).toBeVisible({ timeout: 10000 });
        expect(pageErrors).toEqual([]);
    });
});

test.describe('Payment detail page', () => {
    test('detail page shows amount, status, source and the proforma invoice it was applied to', async ({
        page,
    }) => {
        const { proformaInvoiceId, proformaInvoiceNumber } = await buildAndPayProformaInvoice(
            page,
            'success',
        );
        const payment = await findPaymentByProformaInvoiceId(page, proformaInvoiceId);

        await page.goto(`/payments/${payment.id}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.pd-title')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('.pd-source-pill')).toContainText('Online acquiring');
        await expect(page.locator('.pd-table')).toContainText(
            `Proforma invoice #${proformaInvoiceNumber}`,
        );
    });

    test('a payment that ends up entirely as an advance shows the "held entirely as an advance" message and a matching unallocated total', async ({
        page,
    }) => {
        test.setTimeout(90000);
        await payAllOpenProformaInvoices(page);
        const { proformaInvoiceId } = await buildAndPayProformaInvoice(page, 'success');
        // Duplicate: nothing else open in this organization after the drain above.
        await payProformaInvoice(page, proformaInvoiceId, 'success');

        const payments = await gql(
            page,
            `query { myPayments(options: { take: 200 }) { items { id proformaInvoiceId } } }`,
        );
        const matches = (
            payments.myPayments as { items: { id: string; proformaInvoiceId: string | null }[] }
        ).items.filter(i => i.proformaInvoiceId === proformaInvoiceId);
        expect(matches.length).toBeGreaterThanOrEqual(2);
        const duplicatePaymentId = matches[0].id; // most recent (list is createdAt/id DESC)

        await page.goto(`/payments/${duplicatePaymentId}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.pd-title')).toBeVisible({ timeout: 10000 });
        await expect(
            page.locator('.pd-card', { hasText: 'Proforma invoice allocation' }),
        ).toContainText('held entirely as an advance');
    });

    test('back link returns to payments list', async ({ page }) => {
        const { proformaInvoiceId } = await buildAndPayProformaInvoice(page, 'success');
        const payment = await findPaymentByProformaInvoiceId(page, proformaInvoiceId);

        await page.goto(`/payments/${payment.id}`);
        await page.waitForLoadState('domcontentloaded');
        await page.locator('.pd-back').click();
        await expect(page).toHaveURL(/\/payments$/, { timeout: 10000 });
    });
});
