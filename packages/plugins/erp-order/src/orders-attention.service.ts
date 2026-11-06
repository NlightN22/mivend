import { Injectable } from '@nestjs/common';
import { Order, PaginatedList, RequestContext } from '@vendure/core';
import { SortOrder } from '@vendure/common/lib/generated-types';
import { ApprovalRequestQueryService } from '@mivend/plugin-approval-workflow';
import { OrderVisibilityService } from './order-visibility.service';

const OPEN_STATES = { notIn: ['AddingItems', 'Draft', 'Cancelled', 'Delivered'] };
const ATTENTION_ROWS = 5;

export interface OrdersAttention {
    waiting: PaginatedList<Order>;
    overdueRows: PaginatedList<Order>;
    both: { totalItems: number };
    pendingPriceAdjustmentOrderIds: string[];
}

@Injectable()
export class OrdersAttentionService {
    constructor(
        private visibility: OrderVisibilityService,
        private approvals: ApprovalRequestQueryService,
    ) {}

    async load(ctx: RequestContext, overdueBefore: Date): Promise<OrdersAttention> {
        const ids = await this.approvals.findPendingPriceAdjustmentOrderIds(ctx);
        const overdue = {
            state: { eq: 'PaymentSettled' },
            orderPlacedAt: { before: overdueBefore },
        };
        const [waiting, overdueRows, both] = await Promise.all([
            this.visibility.findVisible(ctx, {
                take: ATTENTION_ROWS,
                filter: { id: { in: ids }, state: OPEN_STATES },
            }),
            this.visibility.findVisible(ctx, {
                take: ATTENTION_ROWS,
                sort: { orderPlacedAt: SortOrder.ASC },
                filter: overdue,
            }),
            this.visibility.findVisible(ctx, { take: 0, filter: { id: { in: ids }, ...overdue } }),
        ]);
        return {
            waiting,
            overdueRows,
            both: { totalItems: both.totalItems },
            pendingPriceAdjustmentOrderIds: ids,
        };
    }
}
