export type NumberingDocumentType =
    | 'order'
    | 'proforma-invoice'
    | 'payment'
    | 'refund'
    | 'discount-grant';

// Fixed, hardcoded names — never built from caller input (see NumberingService.next).
export const NUMBERING_SEQUENCE_NAMES: Record<NumberingDocumentType, string> = {
    order: 'mivend_number_seq_order',
    'proforma-invoice': 'mivend_number_seq_proforma_invoice',
    payment: 'mivend_number_seq_payment',
    refund: 'mivend_number_seq_refund',
    'discount-grant': 'mivend_number_seq_discount_grant',
};

export const NUMBERING_PLUGIN_OPTIONS = Symbol('NUMBERING_PLUGIN_OPTIONS');

export interface NumberingPluginOptions {
    instanceNumberCode: string;
}
