declare module '@vendure/core' {
    interface CustomOrderFields {
        erpOrderId?: string | null;
        erpStatus?: string | null;
        erpStatusAt?: Date | null;
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
