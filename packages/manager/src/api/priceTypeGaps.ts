import { adminApi } from './client';
import {
    PriceTypeGapCounterpartiesDocument,
    type PriceTypeGapCounterpartiesQuery,
} from './generated/graphql';

export type PriceTypeGapRow =
    PriceTypeGapCounterpartiesQuery['priceTypeGapCounterparties']['items'][number];

export const PRICE_TYPE_GAP_REASONS: Record<string, string> = {
    'no-main-contract': 'No main contract in the ERP',
    'contract-not-found': 'Main contract not received from the ERP',
    'contract-inactive': 'Main contract is inactive in the ERP',
    'price-type-not-synced': 'Contract price type not received from the ERP',
};

export async function fetchPriceTypeGaps(args: {
    skip: number;
    take: number;
    search?: string;
}): Promise<PriceTypeGapCounterpartiesQuery['priceTypeGapCounterparties']> {
    const result = await adminApi(PriceTypeGapCounterpartiesDocument, {
        ...args,
        search: args.search || undefined,
    });
    return result.priceTypeGapCounterparties;
}
