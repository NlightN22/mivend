import { Args, Query, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    Order,
    PaginatedList,
    Permission,
    RequestContext,
    UserInputError,
} from '@vendure/core';
import { OrderListOptions } from '@vendure/common/lib/generated-types';

import { OrderListService } from './order-list.service';
import type { OrderListInput } from './order-list-query';
import { OrderVisibilityService } from './order-visibility.service';

@Resolver()
export class AdminOrderVisibilityResolver {
    constructor(
        private orderVisibilityService: OrderVisibilityService,
        private orderListService: OrderListService,
    ) {}

    // Built-in Vendure `orders` query returns all company orders regardless of caller role;
    // not safe to expose in the manager portal, so this scoped query replaces it.
    @Query()
    @Allow(Permission.ReadOrder)
    async visibleOrders(
        @Ctx() ctx: RequestContext,
        @Args()
        args: {
            options?: OrderListOptions;
            managerId?: string;
            customerId?: string;
            search?: string;
            list?: OrderListInput;
        },
    ): Promise<PaginatedList<Order>> {
        if (args.list) {
            if (args.options) throw new UserInputError('Pass either options or list');
            return this.orderListService.findVisible(
                ctx,
                args.list,
                args.managerId,
                args.customerId,
                args.search,
            );
        }
        return this.orderVisibilityService.findVisible(
            ctx,
            args.options,
            args.managerId,
            args.customerId,
            args.search,
        );
    }
}
