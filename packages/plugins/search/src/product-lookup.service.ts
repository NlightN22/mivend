import { Injectable } from '@nestjs/common';
import { Product, RequestContext, TransactionalConnection } from '@vendure/core';
import type { FindOptionsWhere } from 'typeorm';

// Resolves a search-service partOrProductId back to a Vendure Product + its single/default
// variant, mirroring erp-integration's product/price handler productId->variant join pattern
// (Product.customFields.externalId, single-variant-per-product assumption) via Vendure's own
// repository API rather than duplicating erp-integration's raw SQL. See issue #69 — this mapping
// is UNVERIFIED against real overlapping data (no reachable shared dataset at implementation
// time); products with no matching externalId are silently skipped by the caller.
@Injectable()
export class ProductLookupService {
    constructor(private connection: TransactionalConnection) {}

    async findByExternalId(ctx: RequestContext, externalId: string): Promise<Product | null> {
        const repo = this.connection.getRepository(ctx, Product);
        return repo.findOne({
            where: { customFields: { externalId } } as FindOptionsWhere<Product>,
            relations: {
                translations: true,
                featuredAsset: true,
                variants: { translations: true, featuredAsset: true },
            },
        });
    }
}
