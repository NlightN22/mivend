export const SCAN_KIND = 'scan';
export const CONTRACT_FILE_KINDS = [SCAN_KIND, 'power-of-attorney-scan', 'other'] as const;
export type ContractFileKind = (typeof CONTRACT_FILE_KINDS)[number];

// A scan is required only for an active customer contract; other file kinds do not count.
export const UNSCANNED_ACTIVE_CONTRACT_SQL = `EXISTS (SELECT 1 FROM contract k
    WHERE k."counterpartyId" = CAST(c.id AS text) AND k."isActive" AND k."isCustomerContract" IS TRUE
    AND NOT EXISTS (SELECT 1 FROM contract_file f WHERE f."contractId" = k.id AND f.kind = '${SCAN_KIND}'))`;
