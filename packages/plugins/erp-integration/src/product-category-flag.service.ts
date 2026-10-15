import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { ProductCategoryFlag } from './entities/product-category-flag.entity';
import type { CategoryFlag } from './category-resolver';

// No dedupe against still-open flags: each occurrence is its own row (non-blocking report)
// Intentionally differs from reservation/payment reconciliation; matches ProductTaxCodeFlagService
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
