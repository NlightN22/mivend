// Record shapes pushed from erp-import's `document`/`organizationRequisites`
// handlers (packages/plugins/erp-import/src/handlers/) — single source of truth,
// imported there rather than redefined.

export interface DocumentRecord {
    erpId: string;
    // 'return' | 'reconciliation' — validated loosely, not against a hardcoded enum.
    type: string;
    counterpartyErpId: string;
    orderErpId?: string | null;
    number: string;
    issueDate: string;
    amount?: number | null;
    currencyCode?: string | null;
    fileUrl?: string | null;
    metadata?: Record<string, unknown> | null;
}

export interface OrganizationRequisitesRecord {
    erpId: string;
    legalName: string;
    inn: string;
    kpp?: string | null;
    ogrn?: string | null;
    legalAddress: string;
    bankName?: string | null;
    bankAccount?: string | null;
    bankBik?: string | null;
    correspondentAccount?: string | null;
    signatoryName?: string | null;
    signatoryTitle?: string | null;
}
