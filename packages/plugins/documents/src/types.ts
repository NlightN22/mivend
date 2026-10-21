// Single source of truth for record shapes pushed by erp-import's document and organizationRequisites handlers.
// Those handlers import these types; do not redefine them there.

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
    phone?: string | null;
}

export interface DocumentsPluginOptions {
    contractProformaRetentionMonths?: number;
    // Private PDF directory; must never be under AssetServerPlugin's assetUploadDir.
    pdfDir?: string;
}

export interface ResolvedDocumentsPluginOptions extends DocumentsPluginOptions {
    pdfDir: string;
}
