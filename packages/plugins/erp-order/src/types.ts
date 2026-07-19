declare module '@vendure/core' {
    interface CustomOrderFields {
        erpOrderId?: string | null;
        erpStatus?: string | null;
        erpStatusAt?: Date | null;
        // Denormalized at placement time from the customer's preferred TradingPoint — see
        // ErpOrderService.onOrderPlaced and docs/access-control.md's branch-scope axis.
        tradingPointId?: string | null;
        branchId?: string | null;
        // Denormalized from the order's own Fulfillments — see ErpOrderService's
        // onFulfillmentStateChanged and vendure-config.ts's doc comment on this field.
        latestFulfillmentState?: string | null;
        // Denormalized at placement time — see ErpOrderService.onOrderPlaced.
        placedByAdministratorId?: string | null;
    }
}

export const ERP_ORDER_STATUSES = [
    'PENDING',
    'SENT_TO_ERP',
    'RESERVED',
    'CONFIRMED',
    'ASSEMBLED',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
] as const;

export type ErpOrderStatus = (typeof ERP_ORDER_STATUSES)[number];

export interface ErpStatusUpdatePayload {
    orderCode: string;
    status: ErpOrderStatus;
    erpOrderId?: string;
}

export interface OrderErpStatusInfo {
    orderCode: string;
    status: ErpOrderStatus | null;
    erpOrderId: string | null;
    updatedAt: Date | null;
}
