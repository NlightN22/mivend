export const CONTRACT_PROFORMA_KINDS = ['debt-repayment', 'advance'] as const;
export type ContractProformaKind = (typeof CONTRACT_PROFORMA_KINDS)[number];

export function isContractKind(kind: string | null | undefined): kind is ContractProformaKind {
    return (CONTRACT_PROFORMA_KINDS as readonly string[]).includes(kind ?? '');
}
