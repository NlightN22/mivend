import { adminApi } from './client';
import { ProformaInvoiceCardDocument, type ProformaInvoiceCardQuery } from './generated/graphql';

export type ProformaCard = NonNullable<ProformaInvoiceCardQuery['proformaInvoice']>;
export type ProformaCardVersion = ProformaCard['versions'][number];
export type ProformaCardLine = ProformaCard['lines'][number];
export type ProformaCardPayment = ProformaCard['payments'][number];

export async function fetchProformaCard(id: string): Promise<ProformaCard | null> {
    const result = await adminApi(ProformaInvoiceCardDocument, { id });
    return result.proformaInvoice;
}

// pdfUrl is the authorized same-origin path; download=1 asks for an attachment instead of inline.
export function proformaPdfHref(pdfUrl: string, download: boolean): string {
    return download ? `${pdfUrl}?download=1` : pdfUrl;
}

export const PROFORMA_KIND_LABEL: Record<string, string> = {
    'order-placed': 'Order placed',
    'order-changed': 'Order changed',
    'by-shipment': 'By shipment',
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
    captured: 'Received',
    pending: 'Pending',
    authorized: 'Authorized',
    failed: 'Failed',
    canceled: 'Canceled',
    refunded: 'Refunded',
    partiallyRefunded: 'Partially refunded',
    disputed: 'Disputed',
    chargeback: 'Chargeback',
};
