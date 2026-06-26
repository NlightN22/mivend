export interface ErpChangeSet {
    events: Array<{ type: string; payload: Record<string, unknown> }>;
    cursor: Date;
}

export interface ErpOrderRef {
    erpOrderId: string;
}

export interface Order {
    orderId: string;
    lines: Array<{ variantId: string; quantity: number; unitPrice: number }>;
}

export interface InventoryDelta {
    variantId: string;
    branchId: string;
    delta: number;
}

export interface ErpAdapter {
    fetchChanges(since: Date): Promise<ErpChangeSet>;
    pushOrder(order: Order): Promise<ErpOrderRef>;
    pushInventoryDelta(delta: InventoryDelta): Promise<void>;
}
