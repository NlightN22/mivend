import type { ErpOrderStatus } from './types';

export interface ExternalOrderLineInput {
    productVariantId: string;
    quantity: number;
    unitPriceMinor: number;
}

export interface ExternalOrderInput {
    erpOrderId: string;
    counterpartyErpId: string | null;
    erpStatus: ErpOrderStatus;
    erpOrderStatus: string;
    documentNumber: string | null;
    contractId: string | null;
    orderDate: Date | null;
    totalWithTaxMinor: number | null;
    vatTotalMinor: number | null;
    amountIncludesVat: boolean;
    lines: ExternalOrderLineInput[];
}

export interface ExternalOrderResult {
    kind: 'created' | 'updated';
    orderId: string;
    counterpartyPending: boolean;
}
