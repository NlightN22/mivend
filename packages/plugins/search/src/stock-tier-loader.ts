import DataLoader from 'dataloader';
import { RequestContext } from '@vendure/core';
import type { StockLevelService, StockTier } from '@mivend/plugin-reservation';

const loaders = new WeakMap<RequestContext, DataLoader<string, StockTier>>();

// Batches the per-result `stockLevel` field resolvers of one request into a single ATP query.
export function stockTierLoader(
    ctx: RequestContext,
    service: StockLevelService,
): DataLoader<string, StockTier> {
    let loader = loaders.get(ctx);
    if (!loader) {
        loader = new DataLoader(async variantIds => {
            const tiers = await service.getTiers(ctx, [...variantIds]);
            return variantIds.map(id => tiers.get(id) ?? 'OUT_OF_STOCK');
        });
        loaders.set(ctx, loader);
    }
    return loader;
}
