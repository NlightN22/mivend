import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';

import { ProductCrossReference } from './entities/product-cross-reference.entity';
import { OemRef, loggerCtx } from './types';

@Injectable()
export class CrossReferenceService {
    constructor(private connection: TransactionalConnection) {}

    async findByProductId(
        ctx: RequestContext,
        productId: number,
    ): Promise<ProductCrossReference[]> {
        return this.connection
            .getRepository(ctx, ProductCrossReference)
            .find({ where: { productId } });
    }

    async upsertForProduct(ctx: RequestContext, productId: number, refs: OemRef[]): Promise<void> {
        const repo = this.connection.getRepository(ctx, ProductCrossReference);
        await repo.delete({ productId });
        if (refs.length === 0) return;
        const entities = refs.map(ref => repo.create({ productId, ...ref }));
        await repo.save(entities);
        Logger.verbose(
            `Upserted ${entities.length} cross-refs for productId=${productId}`,
            loggerCtx,
        );
    }
}
