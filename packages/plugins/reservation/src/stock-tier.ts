import { wholePackQuantity } from '@mivend/plugin-moq';

export type StockTier = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'MEDIUM_STOCK' | 'HIGH_STOCK';

export const DEFAULT_STOCK_TIER_LOW_MAX = 4;
export const DEFAULT_STOCK_TIER_MEDIUM_MAX = 19;

export interface StockTierThresholds {
    lowMax: number;
    mediumMax: number;
}

// packRatio above 1 means the variant is sold in packs: the tiers then count sellable packs, not base units.
// A ratio with no whole multiple within 1000 packs is not sold by packs and stays in base units.
export function stockTierFor(
    atp: number,
    thresholds: StockTierThresholds,
    packRatio: number | null = null,
): StockTier {
    return tierOfSellable(sellableQuantity(atp, packRatio), thresholds);
}

function sellableQuantity(atp: number, packRatio: number | null): number {
    if (packRatio === null || !(packRatio > 1)) return atp;
    const stepBase = wholePackQuantity(packRatio);
    if (stepBase === null) return atp;
    return Math.floor(atp / stepBase + 1e-9) * Math.round(stepBase / packRatio);
}

function tierOfSellable(atp: number, thresholds: StockTierThresholds): StockTier {
    if (atp <= 0) return 'OUT_OF_STOCK';
    if (atp <= thresholds.lowMax) return 'LOW_STOCK';
    if (atp <= thresholds.mediumMax) return 'MEDIUM_STOCK';
    return 'HIGH_STOCK';
}
