export interface SettlementEntryRecord {
    organizationErpId: string;
    counterpartyErpId: string;
    contractErpId: string;
    currency: string;
    amount: number;
    dueDate?: string | null;
}

export interface SettlementDocumentRecord {
    erpId: string;
    version: string;
    documentType: string;
    documentTypeLabel: string;
    number: string;
    date: string;
    isDeleted?: boolean;
    entries: SettlementEntryRecord[];
}

export interface SettlementBalanceRecord {
    key: string;
    version: string;
    organizationErpId: string;
    counterpartyErpId: string;
    contractErpId: string;
    currency: string;
    openingDate?: string | null;
    openingBalance: number;
    closingBalance: number;
    isDeleted?: boolean;
}

export interface SettlementDocumentTypeRecord {
    documentType: string;
    version: string;
    label: string;
    category: string;
    customerVisible: boolean;
    sortOrder?: number | null;
    isDeleted?: boolean;
}
