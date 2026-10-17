import { adminTokenFor } from '../../helpers/api-tokens';
import { test, expect, type Page } from '@playwright/test';
import { E2E_COUNTERPARTY_ID } from '../../fixtures/seed';
import { postBatch, adminGql } from '../../helpers/api';
import { gql, clearCart, searchInStock } from '../orders/helpers';
import { finishOrdersPlacedInEachTest } from '../order-cleanup';

finishOrdersPlacedInEachTest();

const SUPERADMIN = {
    identifier: process.env.SUPERADMIN_USERNAME ?? 'superadmin',
    password: process.env.SUPERADMIN_PASSWORD ?? 'superadmin',
};

// superadmin has no RoleAccessScope, so the scoped counterparties query returns zero rows.
// Only the lookup switches token: generateContract needs superadmin (UpdateCustomer).
const DEPARTMENT_HEAD = { identifier: 'olga.depthead@mivend.dev', password: 'Password123!' };

interface DocumentListItem {
    id: string;
    type: string;
    number: string;
    status: string;
}

async function myDocuments(page: Page): Promise<DocumentListItem[]> {
    const result = await gql(
        page,
        `{ myDocuments(options: { take: 50 }) { items { id type number status } } }`,
    );
    return (result.myDocuments as { items: DocumentListItem[] }).items;
}

async function waitForDocumentReady(
    page: Page,
    predicate: (d: DocumentListItem) => boolean,
): Promise<DocumentListItem> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        const docs = await myDocuments(page);
        const found = docs.find(predicate);
        if (found && (found.status === 'ready' || found.status === 'failed')) return found;
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Document did not reach a terminal status in time');
}

// ERP-sourced documents can only be seeded via the erp-import REST endpoint;
// Vendure-generated ones need a real checkout or the Admin contract mutation.
test.describe('Documents page — all document types', () => {
    test('ERP-pushed return and reconciliation documents render with the correct type, number and a working download link', async ({
        page,
    }) => {
        const returnErpId = `e2e-return-${Date.now()}`;
        const returnNumber = `RET-E2E-${Date.now()}`;
        const reconciliationErpId = `e2e-reconciliation-${Date.now()}`;
        const reconciliationNumber = `REC-E2E-${Date.now()}`;

        await postBatch(`e2e-doc-return-${Date.now()}`, [
            {
                type: 'document',
                data: {
                    erpId: returnErpId,
                    type: 'return',
                    counterpartyErpId: E2E_COUNTERPARTY_ID,
                    number: returnNumber,
                    issueDate: new Date().toISOString(),
                    amount: 12300,
                    currencyCode: 'RUB',
                    fileUrl: 'https://example.com/documents/e2e-return.pdf',
                },
            },
        ]);
        await postBatch(`e2e-doc-reconciliation-${Date.now()}`, [
            {
                type: 'document',
                data: {
                    erpId: reconciliationErpId,
                    type: 'reconciliation',
                    counterpartyErpId: E2E_COUNTERPARTY_ID,
                    number: reconciliationNumber,
                    issueDate: new Date().toISOString(),
                    amount: 45600,
                    currencyCode: 'RUB',
                    fileUrl: 'https://example.com/documents/e2e-reconciliation.pdf',
                    metadata: { periodStart: '2026-06-01', periodEnd: '2026-06-30' },
                },
            },
        ]);

        await page.goto('/documents');
        await page.waitForLoadState('domcontentloaded');

        await expect(page.getByText(returnNumber)).toBeVisible({ timeout: 10000 });
        await expect(page.getByText(reconciliationNumber)).toBeVisible({ timeout: 10000 });

        const returnRow = page.locator('.doc-row', { hasText: returnNumber });
        const [popup] = await Promise.all([
            page.context().waitForEvent('page'),
            returnRow.getByRole('link', { name: 'Download' }).click(),
        ]);
        expect(popup.url()).toContain('example.com/documents/e2e-return.pdf');
        await popup.close();
    });

    test('a bank-transfer checkout generates a real, downloadable proforma invoice document', async ({
        page,
    }) => {
        await clearCart(page);
        const variantId = await searchInStock(page);
        await gql(
            page,
            `mutation($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 1) { __typename } }`,
            { id: variantId },
        );
        const methods = await gql(page, `{ eligibleShippingMethods { id } }`);
        const methodId = (methods.eligibleShippingMethods as { id: string }[])[0].id;
        await gql(
            page,
            `mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { __typename } }`,
            { id: [methodId] },
        );
        const transitioned = await gql(
            page,
            `mutation { transitionOrderToState(state: "ArrangingPayment") { __typename ... on Order { code } } }`,
        );
        const orderCode = (transitioned.transitionOrderToState as { code: string }).code;
        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename } }`,
        );

        const proformaInvoice = await waitForDocumentReady(
            page,
            // Proforma numbers are versioned per order: <order>-<NN>-<version> (#206).
            d => d.type === 'proforma-invoice' && d.number.startsWith(`${orderCode}-`),
        );
        expect(proformaInvoice.status).toBe('ready');

        await page.goto('/documents');
        await page.waitForLoadState('domcontentloaded');
        await expect(page.getByText(proformaInvoice.number)).toBeVisible({ timeout: 10000 });

        // Asset-backed PDFs trigger a native browser download (not a new tab) —
        // unlike ERP-pushed fileUrl documents, which open as a normal page.
        const proformaInvoiceRow = page.locator('.doc-row', { hasText: proformaInvoice.number });
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            proformaInvoiceRow.getByRole('link', { name: 'Download' }).click(),
        ]);
        expect(download.url()).toContain('/assets/source/');
    });

    test('the Admin generateContract mutation produces a real, downloadable contract document', async ({
        page,
    }) => {
        const token = await adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);
        const deptHeadToken = await adminTokenFor(
            DEPARTMENT_HEAD.identifier,
            DEPARTMENT_HEAD.password,
        );

        const counterparties = await adminGql<{
            counterparties: { items: { id: string; erpId: string }[] };
        }>(
            `{ counterparties(options: { take: 200 }) { items { id erpId } } }`,
            undefined,
            deptHeadToken,
        );
        const counterparty = counterparties.data.counterparties.items.find(
            c => c.erpId === E2E_COUNTERPARTY_ID,
        );
        expect(counterparty).toBeTruthy();

        await adminGql(
            `mutation($id: ID!) { generateContract(counterpartyId: $id) }`,
            { id: counterparty!.id },
            token,
        );

        const contract = await waitForDocumentReady(page, d => d.type === 'contract');
        expect(contract.status).toBe('ready');

        await page.goto('/documents');
        await page.waitForLoadState('domcontentloaded');
        await expect(page.getByText(contract.number)).toBeVisible({ timeout: 10000 });

        const contractRow = page.locator('.doc-row', { hasText: contract.number });
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            contractRow.getByRole('link', { name: 'Download' }).click(),
        ]);
        expect(download.url()).toContain('/assets/source/');
    });

    test('type filter chip narrows the list to matching documents only', async ({ page }) => {
        await page.goto('/documents');
        await page.waitForLoadState('domcontentloaded');

        const allChip = page.getByRole('button', { name: /All documents/i });
        await expect(allChip).toBeVisible();

        const returnChip = page.getByRole('button', { name: /^Return/i });
        await expect(returnChip).toBeVisible();
        await returnChip.click();

        const rows = page.locator('.doc-row');
        const count = await rows.count();
        expect(count).toBeGreaterThan(0);
        await expect(page.locator('.doc-row').first()).toContainText('RET');
    });
});
