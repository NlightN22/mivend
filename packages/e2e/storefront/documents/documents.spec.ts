import { adminTokenFor } from '../../helpers/api-tokens';
import { test, expect, type Page } from '@playwright/test';
import { E2E_COUNTERPARTY_ID } from '../../fixtures/seed';
import { postBatch, adminGql } from '../../helpers/api';
import { addItem, gql, clearCart, searchInStock } from '../orders/helpers';
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
test.describe('Returns page and document API', () => {
    test('an ERP-pushed return renders on the Returns page with a working download link, a reconciliation document does not', async ({
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

        await page.goto('/returns');
        await page.waitForLoadState('domcontentloaded');

        await expect(page.getByText(returnNumber)).toBeVisible({ timeout: 10000 });
        await expect(page.getByText(reconciliationNumber)).toHaveCount(0);

        const returnRow = page.locator('.doc-row', { hasText: returnNumber });
        const [popup] = await Promise.all([
            page.context().waitForEvent('page'),
            returnRow.getByRole('link', { name: 'Download' }).click(),
        ]);
        expect(popup.url()).toContain('example.com/documents/e2e-return.pdf');
        await popup.close();
    });

    test('a bank-transfer checkout leaves proforma invoices out of the documents list (#405)', async ({
        page,
    }) => {
        await clearCart(page);
        const variantId = await searchInStock(page);
        await addItem(page, variantId);
        const methods = await gql(page, `{ eligibleShippingMethods { id } }`);
        const methodId = (methods.eligibleShippingMethods as { id: string }[])[0].id;
        await gql(
            page,
            `mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { __typename } }`,
            { id: [methodId] },
        );
        await gql(
            page,
            `mutation { transitionOrderToState(state: "ArrangingPayment") { __typename } }`,
        );
        await gql(
            page,
            `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename } }`,
        );

        expect((await myDocuments(page)).filter(d => d.type === 'proforma-invoice')).toHaveLength(
            0,
        );

        await page.goto('/returns');
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.doc-row', { hasText: /proforma/i })).toHaveCount(0);
    });

    test('the Admin generateContract mutation produces a ready contract document', async ({
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
    });

    test('the old /documents link redirects to the Returns page, which lists only returns', async ({
        page,
    }) => {
        await page.goto('/documents');
        await expect(page).toHaveURL(/\/returns$/);
        await expect(page.getByRole('heading', { name: 'Returns' })).toBeVisible();
        await expect(page.getByRole('button', { name: /All documents/i })).toHaveCount(0);

        const rows = page.locator('.doc-row');
        await expect(rows.first()).toContainText('RET', { timeout: 10000 });
        await expect(rows.filter({ hasNotText: 'RET' })).toHaveCount(0);
    });
});
