import { expect, type Page } from '@playwright/test';
import { gql } from '../orders/helpers';
import { addSku, admin, placeViaApi } from '../checkout-credit/helpers';

export interface ProformaRow {
    id: string;
    number: string;
    version: number;
    status: string;
    amount: number;
    organizationId: string;
    supersededBy: { id: string; number: string; version: number } | null;
    document: { status: string; pdfUrl: string | null } | null;
}

const FIELDS = `id number version status amount organizationId supersededBy { id number version } document { status pdfUrl }`;

export async function placeBankOrder(page: Page, skus: string[]): Promise<string> {
    for (const sku of skus) await addSku(page, sku, 1);
    const placed = await placeViaApi(page, 'offline-terms');
    expect(placed.typename).toBe('Order');
    return placed.code as string;
}

export async function proformasOf(page: Page, code: string): Promise<ProformaRow[]> {
    const data = (await gql(
        page,
        `query($c: String!) { myProformaInvoices(options: { orderCode: $c, take: 50 }) { items { ${FIELDS} } } }`,
        { c: code },
    )) as { myProformaInvoices: { items: ProformaRow[] } };
    return data.myProformaInvoices.items;
}

export async function requestProformas(page: Page, code: string): Promise<{ id: string }[]> {
    const data = (await gql(
        page,
        `mutation($c: String!) { requestProformaInvoices(orderCode: $c) { id number version status } }`,
        { c: code },
    )) as { requestProformaInvoices: { id: string }[] };
    return data.requestProformaInvoices;
}

export async function orderTotal(code: string): Promise<{ id: string; total: number }> {
    const d = await admin<{ orders: { items: { id: string; totalWithTax: number }[] } }>(
        `query($c: String!) { orders(options: { filter: { code: { eq: $c } } }) { items { id totalWithTax } } }`,
        { c: code },
    );
    return { id: d.orders.items[0].id, total: d.orders.items[0].totalWithTax };
}

// Modifying -> raise a line quantity -> ArrangingAdditionalPayment -> manual payment of the difference.
export async function modifyOrderQuantity(orderId: string, quantity: number): Promise<void> {
    await admin(
        `mutation($id: ID!) { transitionOrderToState(id: $id, state: "Modifying") { __typename } }`,
        { id: orderId },
    );
    const o = await admin<{ order: { lines: { id: string }[] } }>(
        `query($id: ID!) { order(id: $id) { lines { id } } }`,
        { id: orderId },
    );
    await admin(`mutation($i: ModifyOrderInput!) { modifyOrder(input: $i) { __typename } }`, {
        i: {
            orderId,
            dryRun: false,
            adjustOrderLines: [{ orderLineId: o.order.lines[0].id, quantity }],
        },
    });
    await admin(
        `mutation($id: ID!) { transitionOrderToState(id: $id, state: "ArrangingAdditionalPayment") { __typename } }`,
        { id: orderId },
    );
    await admin(
        `mutation($i: ManualPaymentInput!) { addManualPaymentToOrder(input: $i) { __typename } }`,
        {
            i: {
                orderId,
                method: 'offline-terms',
                transactionId: `e2e-${Date.now()}`,
                metadata: {},
            },
        },
    );
}

// Bounded polling: the PDF is rendered by the worker's background job. Returns null when no
// document became ready in time (no worker on this contour), so the caller can skip with a reason.
export async function waitForReadyDocument(
    page: Page,
    code: string,
    timeoutMs = 20000,
): Promise<ProformaRow[] | null> {
    const deadline = Date.now() + timeoutMs;
    let delay = 500;
    for (;;) {
        const rows = await proformasOf(page, code);
        const live = rows.filter(r => r.status !== 'superseded');
        if (live.length > 0 && live.every(r => r.document?.status === 'ready')) return rows;
        if (Date.now() > deadline) return null;
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * 2, 2000);
    }
}

// The e2e stack runs the worker, so a missing PDF is a failure.
export function requirePdfWorker(rows: ProformaRow[] | null): asserts rows is ProformaRow[] {
    if (rows === null) throw new Error('PDF generation job did not finish: is the worker running?');
}

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';

export async function pdfTextAndPages(
    page: Page,
    url: string,
): Promise<{ text: string; pages: number }> {
    const res = await page.request.get(url);
    expect(res.ok()).toBe(true);
    const base64 = (await res.body()).toString('base64');
    await page.goto('about:blank');
    await page.addScriptTag({ url: `${PDFJS}/pdf.min.js` });
    return page.evaluate(
        async ({ b64, worker }) => {
            const lib = (window as unknown as { pdfjsLib: any }).pdfjsLib; // eslint-disable-line
            lib.GlobalWorkerOptions.workerSrc = worker;
            const data = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            const doc = await lib.getDocument({ data }).promise;
            let text = '';
            for (let i = 1; i <= doc.numPages; i++) {
                const content = await (await doc.getPage(i)).getTextContent();
                text += content.items.map((t: { str: string }) => t.str).join(' ') + '\n';
            }
            return { text, pages: doc.numPages as number };
        },
        { b64: base64, worker: `${PDFJS}/pdf.worker.min.js` },
    );
}
