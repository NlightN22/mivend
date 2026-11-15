export type PowerOfAttorneyStatus = 'active' | 'expired';

export interface PowerOfAttorneyListItem {
    id: string;
    number: string;
    holderName: string;
    validFrom: Date | null;
    validUntil: Date | null;
    status: PowerOfAttorneyStatus;
    scanId: string | null;
    hasScan: boolean;
    contractId: string | null;
    contractName: string | null;
    counterpartyId: string | null;
    counterpartyName: string | null;
    contractDeleted: boolean;
}

export interface PowerOfAttorneyPage {
    items: PowerOfAttorneyListItem[];
    totalItems: number;
}
