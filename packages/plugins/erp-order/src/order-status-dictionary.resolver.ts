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
        // Hidden statuses stay so list filters can exclude final ones; only code, terminal and the flag are exposed.
        return (await this.statuses.dictionary(ctx)).entries.map(entry =>
            entry.customerVisible
                ? {
                      code: entry.code,
                      name: entry.name,
                      description: entry.description,
                      customerGroup: entry.customerGroup,
                      terminal: entry.terminal,
                      cancelled: entry.cancelled,
                      rejected: entry.rejected,
                      customerVisible: true,
                  }
                : {
                      code: entry.code,
                      name: '',
                      description: '',
                      customerGroup: '',
                      terminal: entry.terminal,
                      cancelled: false,
                      rejected: false,
                      customerVisible: false,
                  },
        );
    }
}
