import { Args, Query, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, RequestContext } from '@vendure/core';

import { CrossReferenceService } from './cross-reference.service';
import { ProductCrossReference } from './entities/product-cross-reference.entity';

@Resolver()
export class CrossReferenceAdminResolver {
    constructor(private crossReferenceService: CrossReferenceService) {}

    // Gated the same as browsing the catalog itself — anyone who can see a product can see
    // which OEM codes it's interchangeable with (see docs/ai/manager-portal-pages/
    // 07-product-detail.md "Cross-references / applicability").
    @Query()
    @Allow(Permission.ReadCatalog)
    async productCrossReferences(
        @Ctx() ctx: RequestContext,
        @Args() args: { productId: string },
    ): Promise<ProductCrossReference[]> {
        return this.crossReferenceService.findByProductId(ctx, Number(args.productId));
    }
}
