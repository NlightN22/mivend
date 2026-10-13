export const loggerCtx = 'SettlementPlugin';
export const DEFAULT_RETENTION_MONTHS = 12;
export const RETENTION_TASK_ID = 'settlement-retention';

export interface SettlementOrderLinkInput {
    orderErpId: string;
    orderUuid: string | null;
    amount: number;
}

export interface SettlementEntryInput {
    organizationErpId: string;
    counterpartyErpId: string;
    contractErpId: string;
    currency: string;
    amount: number;
    dueDate: Date | null;
    orderLinks: SettlementOrderLinkInput[];
}

export interface SettlementDocumentInput {
    erpId: string;
    version: string;
    isDeleted: boolean;
    documentType: string;
    documentTypeLabel: string;
    number: string;
    date: Date | null;
    entries: SettlementEntryInput[];
}

export interface SettlementBalanceInput {
    key: string;
    version: string;
    isDeleted: boolean;
    organizationErpId: string;
    counterpartyErpId: string;
    contractErpId: string;
    currency: string;
    openingDate: Date | null;
    openingBalance: number;
    closingBalance: number;
}

export interface SettlementDocumentTypeInput {
    documentType: string;
    version: string;
    isDeleted: boolean;
    label: string;
    category: string;
    customerVisible: boolean;
    sortOrder: number | null;
}

export type SettlementApplyResult = 'applied' | 'stale' | 'unknown-deleted';

declare module '@vendure/core' {
    interface CustomGlobalSettingsFields {
        settlementRetentionMonths?: number | null;
    }
}
