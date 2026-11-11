import { adminApi } from './client';
import {
    SettlementTypeCountsDocument,
    type SettlementFilterParameter,
    type SettlementListItemFieldsFragment,
} from './generated/graphql';

export type SettlementListItem = SettlementListItemFieldsFragment;

export interface SettlementTypeCount {
    documentType: string;
    label: string;
    count: number;
}

// The chips are built from the data: one per document type that has rows for this search and filter.
export async function fetchSettlementTypeCounts(
    counterpartyId: string,
    search?: string,
    filter?: SettlementFilterParameter,
): Promise<SettlementTypeCount[]> {
    const result = await adminApi(SettlementTypeCountsDocument, {
        counterpartyId: counterpartyId || undefined,
        search: search || undefined,
        filter,
    });
    return result.counts;
}
