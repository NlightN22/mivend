import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { ProductCategoryFlag } from './entities/product-category-flag.entity';
import type { CategoryFlag } from './category-resolver';

// Persists ProductStreamHandler's non-blocking category-resolution review flags (issue #116).
// Report-only — mirrors ProductTaxCodeFlagService exactly (no dedupe-on-still-open check: unlike
// the reservation/payment reconciliation issues, each occurrence is its own row, same as the VAT
// flag's own precedent).
@Injectable()
export class ProductCategoryFlagService {
    constructor(private connection: TransactionalConnection) {}

    async report(
        ctx: RequestContext,
        externalProductId: string,
        rawCategoryId: string | null,
        flag: CategoryFlag,
    ): Promise<ProductCategoryFlag> {
        const repo = this.connection.getRepository(ctx, ProductCategoryFlag);
        return repo.save(
            repo.create({
                externalProductId,
                rawCategoryId,
                reason: flag.reason,
                detail: flag.detail,
                detectedAt: new Date(),
            }),
        );
    }
}
