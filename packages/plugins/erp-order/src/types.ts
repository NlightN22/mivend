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
        // Set by plugin-reservation's ReservationWriteOffSyncService from Integration Service's
        // company.orders.events.v1.OrderRegistrationResult — staff-facing informational fields,
        // never read by any reservation/order-state decision. See vendure-config.ts's own doc
        // comment on these two customFields for the proto3 optional-vs-plain distinction.
        erpRegistrationDocumentNumber?: string | null;
        erpRegistrationStatus?: string | null;
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
