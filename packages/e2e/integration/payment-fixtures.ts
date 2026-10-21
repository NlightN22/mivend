import { chromium, type Page } from '@playwright/test';
import { loginAs } from '../helpers/storefront-auth';
import { E2E_BROWSER_USER_AGENT } from '../helpers/user-agent';
import { clearCart, gql, orderStep } from '../storefront/orders/helpers';
import { literal, select } from './contour-db';
import { loadContourEnv } from './contour-env';
import { placedOrder } from './erp-wait';
import { adminCall } from './price-type-access';
import { addLine, placeOrderInCheckout } from './storefront-flow';
import type { SampleProforma } from './proforma-scope';

export interface Login {
    email: string;
    password: string;
}

export interface PaymentSample {
    paymentId: string;
    refundId: string;
    proforma: SampleProforma;
}

const MAX_TRIES = 20;
// Stable per payment, so a rerun finds the refund of an earlier run instead of adding another.
const refundMarker = (paymentId: string): string => `e2e-int-263-refund-${paymentId}`;

export function counterpartyOf(email: string): string {
    const row = select<{
        cp: string | null;
    }>(`SELECT "customFieldsCounterpartyid" AS cp FROM customer
        WHERE "emailAddress" = '${email.replace(/'/g, "''")}' AND "deletedAt" IS NULL`)[0];
    if (!row?.cp) throw new Error('The test customer has no counterparty on the contour');
    return row.cp;
}

function proformaRow(where: string): SampleProforma | undefined {
    return select<SampleProforma>(`SELECT pi.id::text AS id, pi.number, pi.status,
            pi."orderId"::text AS "orderId", pi."counterpartyId"::text AS "counterpartyId",
            o."customFieldsTradingpointid" AS "pointId", cp."branchId" AS "homeBranchId"
        FROM proforma_invoice pi JOIN "order" o ON o.id = pi."orderId"
        JOIN counterparty cp ON cp.id::text = pi."counterpartyId"::text
        WHERE ${where} ORDER BY pi.id DESC LIMIT 1`)[0];
}

function capturedPayment(cp: string): { paymentId: string; proformaId: string } | undefined {
    return select<{ paymentId: string; proformaId: string }>(`SELECT pa.id::text AS "paymentId",
            pa."proformaInvoiceId"::text AS "proformaId"
        FROM payment_attempt pa JOIN proforma_invoice pi ON pi.id = pa."proformaInvoiceId"
        WHERE pi."counterpartyId"::text = ${literal(cp)} AND pa."paymentStatus" = 'captured'
        ORDER BY pa.id LIMIT 1`)[0];
}

async function placeOneLineOrder(page: Page): Promise<string> {
    const found = (await gql(
        page,
        `query { search(input: { take: 100, inStock: true, groupByProduct: false }) { items { productVariantId } } }`,
    )) as { search: { items: { productVariantId: string }[] } };
    await clearCart(page);
    for (const { productVariantId: id } of found.search.items.slice(0, MAX_TRIES)) {
        const step = await orderStep(page, id);
        const added = await addLine(page, id, step).catch(() => null);
        if (added?.typename === 'Order' && added.quantity === step) {
            const code = await placeOrderInCheckout(page);
            await placedOrder(code);
            return code;
        }
        await clearCart(page);
    }
    throw new Error('No in-stock variant could be added to the second customer cart');
}

async function issuedProforma(page: Page, cp: string): Promise<string> {
    const open = proformaRow(`pi."counterpartyId"::text = ${literal(cp)} AND pi.status = 'issued'
        AND pi.kind NOT IN ('debt-repayment', 'advance')`);
    if (open) return open.id;
    const code = await placeOneLineOrder(page);
    const data = (await gql(
        page,
        `mutation($c: String!) { requestProformaInvoices(orderCode: $c) { id status } }`,
        { c: code },
    )) as { requestProformaInvoices: { id: string; status: string }[] };
    const issued = data.requestProformaInvoices.find(p => p.status !== 'cancelled');
    if (!issued) throw new Error(`Order ${code} got no payable proforma invoice`);
    return issued.id;
}

// Demo-stub online payment through the Shop API, as the customer; reused when an earlier run made one.
export async function ensurePayment(customer: Login): Promise<string> {
    const cp = counterpartyOf(customer.email);
    const existing = capturedPayment(cp);
    if (existing) return existing.paymentId;
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({
            baseURL: loadContourEnv().storefrontUrl,
            userAgent: E2E_BROWSER_USER_AGENT,
        });
        await loginAs(page, customer.email, customer.password);
        const proformaId = await issuedProforma(page, cp);
        await gql(
            page,
            `mutation($id: ID!) { payProformaInvoice(proformaInvoiceId: $id, status: "success") { id } }`,
            { id: proformaId },
        );
        await gql(page, 'mutation { logout { success } }');
    } finally {
        await browser.close();
    }
    const made = capturedPayment(cp);
    if (!made) throw new Error('payProformaInvoice left no captured payment');
    return made.paymentId;
}

export async function ensureRefund(superadmin: string, paymentId: string): Promise<string> {
    const marker = refundMarker(paymentId);
    const find = (): string | undefined =>
        select<{ id: string }>(`SELECT id::text AS id FROM payment_refund
            WHERE "providerRefundId" = ${literal(marker)}`)[0]?.id;
    const existing = find();
    if (existing) return existing;
    const made = await adminCall(
        superadmin,
        `mutation($p: ID!, $r: String!) { recordPaymentRefund(paymentId: $p, amount: 100,
            reason: "e2e-integration refund sample", providerRefundId: $r) { id } }`,
        { p: paymentId, r: marker },
    );
    if (made.errors.length) throw new Error(`recordPaymentRefund: ${made.errors.join(' ')}`);
    return find() as string;
}

export async function paymentSample(superadmin: string, customer: Login): Promise<PaymentSample> {
    const paymentId = await ensurePayment(customer);
    const refundId = await ensureRefund(superadmin, paymentId);
    const proforma = proformaRow(`pi.id = (SELECT "proformaInvoiceId" FROM payment_attempt
        WHERE id = ${literal(paymentId)})`);
    if (!proforma) throw new Error(`Payment ${paymentId} has no proforma invoice`);
    return { paymentId, refundId, proforma };
}

export function refundCount(paymentId: string): number {
    return select<{ n: number }>(`SELECT count(*)::int AS n FROM payment_refund
        WHERE "paymentId" = ${literal(paymentId)}`)[0].n;
}

export function openIssueIds(): { id: string; proformaId: string | null }[] {
    return select<{ id: string; proformaId: string | null }>(`SELECT id::text AS id,
        "proformaInvoiceId"::text AS "proformaId" FROM payment_reconciliation_issue WHERE status = 'open'`);
}

export function proformasByIds(ids: string[]): SampleProforma[] {
    return ids.map(id => proformaRow(`pi.id = ${literal(id)}`)).filter(p => p !== undefined);
}
