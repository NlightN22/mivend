export type OrderErpFacts = Partial<
    Record<'erpAccounting' | 'erpLinkedDocuments' | 'erpShippedInSettlements', string>
>;

export interface ExternalOrderLineInput {
    productVariantId: string;
    quantity: number;
    unitPriceMinor: number;
}

export interface ExternalOrderInput {
    erpOrderId: string;
    counterpartyErpId: string | null;
    erpStatus: string | null;
    erpStatusAt: Date | null;
    erpOrderStatus: string;
    documentNumber: string | null;
    contractId: string | null;
    orderDate: Date | null;
    totalWithTaxMinor: number | null;
    vatTotalMinor: number | null;
    amountIncludesVat: boolean;
    paidAmountMinor: number | null;
    // Only the facts the event carried; an absent one never clears a stored value.
    erpFacts?: OrderErpFacts;
    lines: ExternalOrderLineInput[];
    skippedLineCount: number;
}

export interface ExternalOrderResult {
    kind: 'created' | 'updated';
    orderId: string;
    counterpartyPending: boolean;
}
