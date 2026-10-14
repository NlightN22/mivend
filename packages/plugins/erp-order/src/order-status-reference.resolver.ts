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

// Null for a mivend-pipeline status: the ERP reference only knows the statuses it derives.
@Resolver('OrderStatusHistoryEntry')
export class OrderStatusReferenceResolver {
    constructor(private statuses: OrderStatusReferenceService) {}

    @ResolveField()
    async reference(
        @Ctx() ctx: RequestContext,
        @Parent() entry: OrderStatusHistoryEntry,
    ): Promise<OrderStatusReferenceInfo | null> {
        const row = await this.statuses.findActive(ctx, entry.status);
        if (!row) return null;
        return {
            code: row.code,
            name: row.name,
            description: row.description,
            customerVisible: row.customerVisible,
        };
    }
}
