export type SyncEventType =
    | 'product.created'
    | 'product.updated'
    | 'product.deleted'
    | 'price.updated'
    | 'customer.created'
    | 'customer.updated'
    | 'credit-terms.updated'
    | 'order.created'
    | 'order.updated'
    | 'inventory.updated';

export interface SyncEvent<T = unknown> {
    eventId: string;
    eventType: SyncEventType;
    sourceInstanceId: string;
    timestamp: string;
    payload: T;
}

export interface SyncOutboxEntry {
    id: string;
    eventType: SyncEventType;
    payload: unknown;
    targetInstanceId: string;
    createdAt: Date;
    deliveredAt: Date | null;
    retryCount: number;
    lastErrorAt: Date | null;
}
