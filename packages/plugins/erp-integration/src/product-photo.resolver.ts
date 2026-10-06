import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    ID,
    ListQueryBuilder,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    Transaction,
} from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { ProductPhoto } from './entities/product-photo.entity';
import { ProductPhotoRecoveryService } from './product-photo-recovery.service';

@Resolver()
export class ProductPhotoResolver {
    constructor(
        private readonly listQueryBuilder: ListQueryBuilder,
        private readonly recoveryService: ProductPhotoRecoveryService,
    ) {}

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async problemProductPhotos(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ListQueryOptions<ProductPhoto> },
    ): Promise<PaginatedList<ProductPhoto>> {
        const qb = this.listQueryBuilder.build(ProductPhoto, args.options, {
            ctx,
            orderBy: { updatedAt: 'DESC' },
        });
        qb.andWhere(`${qb.alias}.status != :ok`, { ok: 'downloaded' }).andWhere(
            `${qb.alias}.isDeleted = false`,
        );
        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    @Mutation()
    @Transaction()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    replayProductPhoto(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID },
    ): Promise<ProductPhoto> {
        return this.recoveryService.replayNow(ctx, args.id);
    }
}
