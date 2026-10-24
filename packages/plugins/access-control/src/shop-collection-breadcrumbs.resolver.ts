import { ResolveField, Parent, Resolver } from '@nestjs/graphql';
import {
    Collection,
    CollectionService,
    Ctx,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { In } from 'typeorm';

import { dropPrivateAncestors } from './shop-collection-breadcrumbs';

// Core resolves breadcrumbs without the privacy filter, leaking hidden ancestors' slug and name.
@Resolver('Collection')
export class ShopCollectionBreadcrumbsResolver {
    constructor(
        private collectionService: CollectionService,
        private connection: TransactionalConnection,
    ) {}

    @ResolveField()
    async breadcrumbs(
        @Ctx() ctx: RequestContext,
        @Parent() collection: Collection,
    ): Promise<{ id: string | number; name: string; slug: string }[]> {
        const crumbs = await this.collectionService.getBreadcrumbs(ctx, collection);
        if (crumbs.length < 3) return crumbs;
        const hidden = await this.connection
            .getRepository(ctx, Collection)
            .find({ where: { id: In(crumbs.slice(1, -1).map(c => c.id)), isPrivate: true } });
        return dropPrivateAncestors(crumbs, new Set(hidden.map(c => String(c.id))));
    }
}
