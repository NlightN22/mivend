import { test, expect } from '@playwright/test';
import {
    CREDIT_BUYER,
    PREPAY_BUYER,
    cancelOpenOrders,
    loginBuyer,
} from '../checkout-credit/helpers';
import {
    modifyOrderQuantity,
    pdfTextAndPages,
    type ProformaRow,
    orderTotal,
    placeBankOrder,
    proformasOf,
    requestProformas,
    waitForReadyDocument,
} from './helpers';
import { gql } from '../orders/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
    await cancelOpenOrders(PREPAY_BUYER);
    await loginBuyer(page, PREPAY_BUYER);
});
test.afterEach(async () => {
    await cancelOpenOrders(PREPAY_BUYER);
});

test.describe('proformas per organization', () => {
    test('one organization gives exactly one proforma', async ({ page }) => {
        const code = await placeBankOrder(page, ['E2E-FLT-001']);
        const rows = await proformasOf(page, code);
        expect(rows).toHaveLength(1);
        expect(rows[0].number).toBe(`${code}-01`);
    });

    test('two organizations give two proformas that add up to the order total', async ({
        page,
    }) => {
        const code = await placeBankOrder(page, ['E2E-FLT-001', 'E2E-BRK-001']);
        const rows = (await proformasOf(page, code)).sort((a, b) =>
            a.number.localeCompare(b.number),
        );
        expect(rows.map(r => r.number)).toEqual([`${code}-01`, `${code}-02`]);
        expect(new Set(rows.map(r => r.organizationId)).size).toBe(2);
        const { total } = await orderTotal(code);
        expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(total);
    });

    test('requesting on demand is idempotent', async ({ page }) => {
        const code = await placeBankOrder(page, ['E2E-FLT-001', 'E2E-BRK-001']);
        const before = (await proformasOf(page, code)).map(r => r.id).sort();
        const first = (await requestProformas(page, code)).map(r => r.id).sort();
        const second = (await requestProformas(page, code)).map(r => r.id).sort();
        expect(first).toEqual(before);
        expect(second).toEqual(before);
    });

    test('a modified order gets version 2 and the old one is superseded in the UI', async ({
        page,
    }) => {
        const code = await placeBankOrder(page, ['E2E-FLT-001']);
        const [v1] = await proformasOf(page, code);
        const { id: orderId } = await orderTotal(code);
        await modifyOrderQuantity(orderId, 3);

        const requested = await requestProformas(page, code);
        const rows = await proformasOf(page, code);
        const v2 = rows.find(r => r.version === 2);
        expect(v2).toBeDefined();
        expect(requested.map(r => r.id)).toContain(v2?.id);
        expect(v2?.number).toBe(`${code}-02`);
        const old = rows.find(r => r.id === v1.id);
        expect(old?.status).toBe('superseded');
        expect(old?.supersededBy?.id).toBe(v2?.id);

        await page.goto(`/proforma-invoices/${v1.id}`);
        await expect(page.getByText(/Replaced by version v2/)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Pay proforma invoice' })).toBeDisabled();
        await page.goto(`/proforma-invoices/${v2?.id}`);
        await expect(page.locator('.version-badge').first()).toHaveText('v2');
    });

    test('another counterparty cannot read the proforma', async ({ page }) => {
        const code = await placeBankOrder(page, ['E2E-FLT-001']);
        const [row] = await proformasOf(page, code);
        await loginBuyer(page, CREDIT_BUYER);
        const data = (await gql(page, `query($id: ID!) { proformaInvoice(id: $id) { id } }`, {
            id: row.id,
        })) as { proformaInvoice: unknown };
        expect(data.proformaInvoice).toBeNull();
        expect(await proformasOf(page, code)).toHaveLength(0);
    });

    test('the PDF carries the number, seller requisites, QR caption, VAT, version and total in words', async ({
        page,
    }) => {
        test.setTimeout(90000);
        const code = await placeBankOrder(page, ['E2E-FLT-001']);
        const rows = await waitForReadyDocument(page, code);
        test.skip(rows === null, 'PDF generation job did not run: no worker on this contour');
        const [row] = rows as ProformaRow[];
        const { text, pages } = await pdfTextAndPages(page, row.document?.asset?.source as string);
        expect(pages).toBe(1);
        expect(text).toContain(row.number);
        expect(text).toContain('Отсканируйте для оплаты');
        expect(text).toContain('В том числе НДС');
        expect(text).toMatch(/ИНН/);
        expect(text).toMatch(/руб/i);
        expect(text).not.toContain('Заменён, не действителен');
    });

    test('a superseded document is marked invalid and has no QR', async ({ page }) => {
        test.setTimeout(120000);
        const code = await placeBankOrder(page, ['E2E-FLT-001']);
        const first = await waitForReadyDocument(page, code);
        test.skip(first === null, 'PDF generation job did not run: no worker on this contour');
        const v1 = (first as ProformaRow[])[0];
        const { id: orderId } = await orderTotal(code);
        await modifyOrderQuantity(orderId, 2);
        await requestProformas(page, code);
        const old = (await proformasOf(page, code)).find(r => r.id === v1.id);
        expect(old?.status).toBe('superseded');
        const { text } = await pdfTextAndPages(page, v1.document?.asset?.source as string);
        expect(text).toContain('Заменён, не действителен');
    });
});
