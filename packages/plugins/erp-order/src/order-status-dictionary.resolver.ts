import { Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import type { OrderStatusEntry } from './order-status-dictionary';
import { OrderStatusReferenceService } from './order-status-reference.service';

@Resolver()
export class OrderStatusDictionaryResolver {
    constructor(private statuses: OrderStatusReferenceService) {}

    @Query()
    @Allow(Permission.ReadOrder)
    async orderStatuses(@Ctx() ctx: RequestContext): Promise<readonly OrderStatusEntry[]> {
        return (await this.statuses.dictionary(ctx)).entries;
    }
}

export type ShopOrderStatus = Pick<
    OrderStatusEntry,
    | 'code'
    | 'name'
    | 'description'
    | 'customerGroup'
    | 'terminal'
    | 'cancelled'
    | 'rejected'
    | 'customerVisible'
>;

@Resolver()
export class ShopOrderStatusDictionaryResolver {
    constructor(private statuses: OrderStatusReferenceService) {}

    @Query()
    @Allow(Permission.Public)
    async orderStatuses(@Ctx() ctx: RequestContext): Promise<ShopOrderStatus[]> {
        // Hidden statuses stay in the list so list filters can still exclude final ones; their texts are blanked.
        return (await this.statuses.dictionary(ctx)).entries.map(
            ({
                code,
                name,
                description,
                customerGroup,
                terminal,
                cancelled,
                rejected,
                customerVisible,
            }) => ({
                code,
                name: customerVisible ? name : code,
                description: customerVisible ? description : '',
                customerGroup,
                terminal,
                cancelled,
                rejected,
                customerVisible,
            }),
        );
    }
}
