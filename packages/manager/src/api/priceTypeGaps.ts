import { adminApi } from './client';
import {
    PriceTypeGapCounterpartiesDocument,
    type PriceTypeGapCounterpartiesQuery,
} from './generated/graphql';
import { lazyLabels } from '../utils/lazyLabels';

export type PriceTypeGapRow =
    PriceTypeGapCounterpartiesQuery['priceTypeGapCounterparties']['items'][number];

export const PRICE_TYPE_GAP_REASONS = lazyLabels('settingsPanels.priceTypeGaps.reasons', [
    'no-main-contract',
    'contract-not-found',
    'contract-inactive',
    'price-type-not-synced',
]);

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
