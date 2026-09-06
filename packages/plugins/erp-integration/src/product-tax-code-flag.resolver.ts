import { Args, Query, Resolver } from '@nestjs/graphql';
import { Ctx, PaginatedList, RequestContext } from '@vendure/core';
import { Allow } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { ProductTaxCodeFlag } from './entities/product-tax-code-flag.entity';
import {
    ProductTaxCodeFlagListOptions,
    ProductTaxCodeFlagService,
} from './product-tax-code-flag.service';

@Resolver()
export class ProductTaxCodeFlagResolver {
    constructor(private productTaxCodeFlagService: ProductTaxCodeFlagService) {}

    @Query()
    @Allow(CustomPermission.ManageAccessControl.Permission)
    async recentProductTaxCodeFlags(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ProductTaxCodeFlagListOptions },
    ): Promise<PaginatedList<ProductTaxCodeFlag>> {
        return this.productTaxCodeFlagService.findRecent(ctx, args.options);
    }
}
