import type { PowerOfAttorneyRow } from '../../api/powersOfAttorneyList';

export type PowerOfAttorneyTableRow = {
    id: string;
    number: string;
    holder: string;
    validFrom: string;
    validUntil: string;
    status: 'active' | 'expired';
    counterpartyId: string;
    customer: string;
    contract: string;
    contractDeleted: boolean;
    hasScan: boolean;
    scanId: string;
};

export function toPowerOfAttorneyRows(items: PowerOfAttorneyRow[]): PowerOfAttorneyTableRow[] {
    return items.map(item => ({
        id: item.id,
        number: item.number,
        holder: item.holderName || '—',
        validFrom: item.validFrom ?? '',
        validUntil: item.validUntil ?? '',
        status: item.status === 'expired' ? 'expired' : 'active',
        counterpartyId: item.counterpartyId ?? '',
        customer: item.counterpartyName ?? '—',
        contract: item.contractName ?? '—',
        contractDeleted: item.contractDeleted,
        hasScan: item.hasScan,
        scanId: item.scanId ?? '',
    }));
}
