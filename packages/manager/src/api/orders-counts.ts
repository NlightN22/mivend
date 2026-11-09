import { adminApi } from './client';
import {
    OrdersViewCountsDocument,
    type OrderListFilter,
    type OrdersViewCountsQueryVariables,
} from './generated/graphql';
import { OVERDUE_AFTER_DAYS, buildOrdersListQuery } from './orders-list';
import type { OrdersListFilters, OrdersView } from './orders-list';

export type OrdersViewCounts = Record<OrdersView, number>;

export interface OrdersViewCountsResult {
    counts: OrdersViewCounts;
    pendingApprovalOrderIds: Set<string>;
}

// A chip's own view replaces the selected one; search and builder conditions stay, as in the list.
export function countsQueryVariables(
    filters: OrdersListFilters,
    customerId: string | undefined,
    rejectedCodes: string[],
    now: Date,
): OrdersViewCountsQueryVariables {
    const forView = (view: OrdersView): OrderListFilter | undefined => {
        const { filter } = buildOrdersListQuery({ ...filters, view }, rejectedCodes, now);
        return Object.keys(filter).length ? (filter as OrderListFilter) : undefined;
    };
    const { managerId, search } = buildOrdersListQuery(filters, rejectedCodes, now);
    return {
        customerId,
        managerId,
        search,
        overdueBefore: new Date(now.getTime() - OVERDUE_AFTER_DAYS * 86_400_000).toISOString(),
        all: forView('all'),
        awaitingConfirmation: forView('awaiting-confirmation'),
        processing: forView('processing'),
        awaitingShipment: forView('awaiting-shipment'),
        rejectedByErp: forView('rejected-by-erp'),
        reservationFailed: forView('reservation-failed'),
        erpRequirements: forView('erp-requirements'),
        overdue: forView('overdue'),
    };
}

// One request: a take:0 COUNT per chip, each filtered by the same builder the list uses.
export async function fetchOrdersViewCounts(
    filters: OrdersListFilters,
    customerId: string | undefined,
    rejectedCodes: string[],
    now: Date = new Date(),
): Promise<OrdersViewCountsResult> {
    const result = await adminApi(
        OrdersViewCountsDocument,
        countsQueryVariables(filters, customerId, rejectedCodes, now),
    );
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
