export type ErpDocumentKind = 'customerClaim' | 'salesCorrection' | 'orderCorrection';
export const ERP_DOCUMENT_KINDS: ErpDocumentKind[] = [
    'customerClaim',
    'salesCorrection',
    'orderCorrection',
];

// Each kind has its own list page.
export const ERP_DOCUMENT_PATHS: Record<ErpDocumentKind, string> = {
    customerClaim: '/documents/customer-claims',
    salesCorrection: '/documents/sales-corrections',
    orderCorrection: '/documents/order-corrections',
};
