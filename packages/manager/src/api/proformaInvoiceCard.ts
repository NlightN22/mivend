import { i18n } from '../i18n';
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

const KINDS = ['order-placed', 'order-changed', 'by-shipment'];
const PAYMENT_STATUSES = [
    'captured',
    'pending',
    'authorized',
    'failed',
    'canceled',
    'refunded',
    'partiallyRefunded',
    'disputed',
    'chargeback',
];

const lazyMap = (prefix: string, keys: string[]): Record<string, string> =>
    Object.defineProperties(
        {},
        Object.fromEntries(
            keys.map(key => [
                key,
                { get: () => i18n.global.t(`${prefix}.${key}`), enumerable: true },
            ]),
        ),
    );

// Labels resolve on read so a language switch reaches these module-level maps.
export const PROFORMA_KIND_LABEL = lazyMap('proformaInvoices.kind', KINDS);
export const PAYMENT_STATUS_LABEL = lazyMap('proformaInvoices.paymentStatus', PAYMENT_STATUSES);
