export interface SettlementDocumentFilter {
    contractId?: string | null;
    organizationId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    search?: string | null;
    category?: string | null;
    overdueOnly?: boolean | null;
    unpaidOnly?: boolean | null;
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
    openAmount: number | null;
    orders: SettlementOrderRef[];
}

export interface SettlementHiddenSummary {
    currency: string;
    count: number;
    netAmount: number;
}

export interface SettlementDocumentPage {
    items: SettlementDocumentRow[];
    totalItems: number;
    hiddenSummary: SettlementHiddenSummary[];
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
    unexplained: number;
    // Earliest due date among the overdue open lots; staff-only, not part of the shop schema.
    oldestOverdueDue: Date | null;
}

export interface CounterpartyOverdue {
    amount: number;
    currency: string;
    oldestDays: number | null;
}
