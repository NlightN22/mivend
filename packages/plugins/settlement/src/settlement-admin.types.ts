import type { SettlementListFilter, SettlementListSort } from './settlement-list-query';

export interface SettlementListOptions {
    take?: number | null;
    skip?: number | null;
    documentType?: string | null;
    search?: string | null;
    filter?: SettlementListFilter | null;
    sort?: SettlementListSort | null;
}

export interface SettlementListItem {
    id: string;
    documentType: string;
    documentTypeLabel: string;
    category: string;
    number: string;
    date: Date;
    counterpartyId: string | null;
    counterpartyShortName: string | null;
    organizationId: string;
    organizationName: string | null;
    contractId: string | null;
    contractName: string | null;
    currencyCode: string;
    amount: number;
    orderCodes: string[];
    proformaInvoiceNumber: string | null;
}

export interface SettlementListPage {
    items: SettlementListItem[];
    totalItems: number;
}

export interface SettlementTypeCount {
    documentType: string;
    label: string;
    count: number;
}

export interface SettlementDocumentTypeInfo {
    documentType: string;
    label: string;
    category: string | null;
    movesTurnover: boolean;
}
