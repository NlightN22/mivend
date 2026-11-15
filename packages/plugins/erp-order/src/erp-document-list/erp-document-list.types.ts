export interface ErpDocumentListItem {
    id: string;
    number: string;
    date: Date | null;
    counterpartyId: string | null;
    counterpartyName: string | null;
    orderId: string | null;
    orderCode: string | null;
    organizationName: string | null;
    contractName: string | null;
    currency: string | null;
    amount: number;
    comment: string | null;
    lineCount: number;
    productNames: string[];
}

export interface ErpDocumentPage {
    items: ErpDocumentListItem[];
    totalItems: number;
}

export interface ErpDocumentCounts {
    customerClaims: number;
    salesCorrections: number;
    orderCorrections: number;
    powersOfAttorney: number;
}
