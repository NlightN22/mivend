import { adminApi } from './client';
import { OrdersViewCountsDocument, type OrderFilterParameter } from './generated/graphql';
import { BLANK_ORDERS_FILTERS, OVERDUE_AFTER_DAYS, buildOrdersListQuery } from './orders-list';
import type { OrdersView } from './orders-list';

export type OrdersViewCounts = Record<OrdersView, number>;

export interface OrdersViewCountsResult {
    counts: OrdersViewCounts;
    pendingApprovalOrderIds: Set<string>;
}

function viewFilter(
    view: OrdersView,
    rejectedCodes: string[],
    now: Date,
): OrderFilterParameter | undefined {
    const { filter } = buildOrdersListQuery({ ...BLANK_ORDERS_FILTERS, view }, rejectedCodes, now);
    return Object.keys(filter).length ? (filter as OrderFilterParameter) : undefined;
}

// One request: a take:0 COUNT per chip, each filtered by the same builder the list uses.
export async function fetchOrdersViewCounts(
    customerId: string | undefined,
    rejectedCodes: string[],
    now: Date = new Date(),
): Promise<OrdersViewCountsResult> {
    const overdueBefore = new Date(now.getTime() - OVERDUE_AFTER_DAYS * 86_400_000).toISOString();
    const f = (view: OrdersView): OrderFilterParameter | undefined =>
        viewFilter(view, rejectedCodes, now);
    const result = await adminApi(OrdersViewCountsDocument, {
        customerId,
        overdueBefore,
        awaitingConfirmation: f('awaiting-confirmation'),
        processing: f('processing'),
        awaitingShipment: f('awaiting-shipment'),
        rejectedByErp: f('rejected-by-erp'),
        reservationFailed: f('reservation-failed'),
        erpRequirements: f('erp-requirements'),
        overdue: f('overdue'),
    });
    return {
        counts: {
            all: result.all.totalItems,
            'awaiting-confirmation': result.awaitingConfirmation.totalItems,
            processing: result.processing.totalItems,
            'awaiting-shipment': result.awaitingShipment.totalItems,
            'rejected-by-erp': result.rejectedByErp.totalItems,
            'reservation-failed': result.reservationFailed.totalItems,
            'erp-requirements': result.erpRequirements.totalItems,
            overdue: result.overdue.totalItems,
        },
        pendingApprovalOrderIds: new Set(result.ordersAttention.pendingPriceAdjustmentOrderIds),
    };
}
