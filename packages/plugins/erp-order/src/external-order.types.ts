import type { ErpOrderStatus } from './types';

export interface ExternalOrderLineInput {
    productVariantId: string;
    quantity: number;
    unitPriceMinor: number;
}

export interface ExternalOrderInput {
    erpOrderId: string;
    counterpartyErpId: string | null;
    erpStatus: ErpOrderStatus | null;
    erpOrderStatus: string;
    documentNumber: string | null;
    contractId: string | null;
    orderDate: Date | null;
    totalWithTaxMinor: number | null;
    vatTotalMinor: number | null;
    amountIncludesVat: boolean;
    paidAmountMinor: number | null;
    lines: ExternalOrderLineInput[];
    skippedLineCount: number;
}

export interface ExternalOrderResult {
    kind: 'created' | 'updated';
    orderId: string;
    counterpartyPending: boolean;
}
