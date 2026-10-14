import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';

import { OrderStatusHistoryEntry } from './entities/order-status-history-entry.entity';
import { OrderStatusReferenceService } from './order-status-reference.service';

export interface OrderStatusReferenceInfo {
    code: string;
    name: string;
    description: string;
    customerVisible: boolean;
}

@Resolver('OrderStatusHistoryEntry')
export class OrderStatusReferenceResolver {
    constructor(private statuses: OrderStatusReferenceService) {}

    @ResolveField()
    async reference(
        @Ctx() ctx: RequestContext,
        @Parent() entry: OrderStatusHistoryEntry,
    ): Promise<OrderStatusReferenceInfo | null> {
        const status = (await this.statuses.dictionary(ctx)).get(entry.status);
        if (!status) return null;
        return {
            code: status.code,
            name: status.name,
            description: status.description,
            customerVisible: status.customerVisible,
        };
    }
}
