import { Args, Query, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, RequestContext } from '@vendure/core';

import { CrossReferenceService } from './cross-reference.service';
import { ProductCrossReference } from './entities/product-cross-reference.entity';

@Resolver()
export class CrossReferenceAdminResolver {
    constructor(private crossReferenceService: CrossReferenceService) {}

    // Gated the same as the catalog: anyone who can see a product can also see its OEM cross-references.
    // Keep these access rules in sync with catalog visibility; stricter gating here alone would be inconsistent.
    @Query()
    @Allow(Permission.ReadCatalog)
    async productCrossReferences(
        @Ctx() ctx: RequestContext,
        @Args() args: { productId: string },
    ): Promise<ProductCrossReference[]> {
        return this.crossReferenceService.findByProductId(ctx, Number(args.productId));
    }
}
