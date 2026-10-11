import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';

import {
    PackagingLevelView,
    ProductPackagingLevelsService,
} from './product-packaging-levels.service';

interface Batch {
    ids: Set<string>;
    result: Promise<Map<string, PackagingLevelView[]>>;
}

// Search results ask for the levels of every item in one tick; those lookups share one query.
@Injectable()
export class SearchResultPackagingLevelsService {
    private readonly batches = new WeakMap<RequestContext, Batch>();

    constructor(private readonly levelsService: ProductPackagingLevelsService) {}

    async load(ctx: RequestContext, productId: string): Promise<PackagingLevelView[]> {
        let batch = this.batches.get(ctx);
        if (!batch) {
            const ids = new Set<string>();
            const result = Promise.resolve().then(() => {
                this.batches.delete(ctx);
                return this.levelsService.getForProducts(ctx, [...ids]);
            });
            batch = { ids, result };
            this.batches.set(ctx, batch);
        }
        batch.ids.add(productId);
        return (await batch.result).get(productId) ?? [];
    }
}
