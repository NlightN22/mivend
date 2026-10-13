export interface SettlementDocumentFilter {
    contractId?: string | null;
    organizationId?: string | null;
    dateFrom?: Date | null;
    dateTo?: Date | null;
    search?: string | null;
    category?: string | null;
    overdueOnly?: boolean | null;
}

export interface SettlementOrderRef {
    orderId: string | null;
    orderCode: string | null;
    orderErpId: string;
    amount: number;
}

export interface SettlementDocumentRow {
    id: string;
    documentType: string;
    documentTypeLabel: string;
    category: string;
    number: string;
    date: Date;
    organizationId: string;
    organizationName: string | null;
    contractId: string | null;
    contractName: string | null;
    currency: string;
    amount: number;
    dueDate: Date | null;
    paymentStatus: string | null;
    orders: SettlementOrderRef[];
}

export interface SettlementDocumentPage {
    items: SettlementDocumentRow[];
    totalItems: number;
}

export interface SettlementBalanceCard {
    organizationId: string;
    organizationName: string | null;
    contractId: string | null;
    contractName: string | null;
    currency: string;
    openingBalance: number;
    currentBalance: number;
    overdue: number;
}

export interface SettlementEntryAging {
    open: number;
    due: Date | null;
}
