import { ResolveField, Parent, Resolver } from '@nestjs/graphql';
import { Collection, Ctx, RequestContext } from '@vendure/core';

import {
    BreadcrumbItem,
    ShopCollectionBreadcrumbsLoader,
} from './shop-collection-breadcrumbs.loader';

// Core resolves breadcrumbs without the privacy filter, leaking hidden ancestors' slug and name.
@Resolver('Collection')
export class ShopCollectionBreadcrumbsResolver {
    constructor(private loader: ShopCollectionBreadcrumbsLoader) {}

    @ResolveField()
    breadcrumbs(
        @Ctx() ctx: RequestContext,
        @Parent() collection: Collection,
    ): Promise<BreadcrumbItem[]> {
        return this.loader.load(ctx, collection);
    }
}
