import { Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import type { OrderStatusEntry } from './order-status-dictionary';
import { OrderStatusReferenceService } from './order-status-reference.service';

@Resolver()
export class OrderStatusDictionaryResolver {
    constructor(private statuses: OrderStatusReferenceService) {}

    @Query()
    @Allow(Permission.Authenticated)
    async orderStatuses(@Ctx() ctx: RequestContext): Promise<readonly OrderStatusEntry[]> {
        return (await this.statuses.dictionary(ctx)).entries;
    }
}
