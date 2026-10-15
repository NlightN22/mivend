import type { ErpAdapter, ErpChangeSet, ErpOrderRef, Order } from './erp-adapter.interface';

export class StubErpAdapter implements ErpAdapter {
    async fetchChanges(): Promise<ErpChangeSet> {
        return {
            events: [
                {
                    // productId must be a numeric string: the column is integer, and it reaches SQL uncoerced.
                    // '1' is a safe no-op: it updates a seeded product or matches zero rows, never throws.
                    type: 'product.updated',
                    payload: { productId: '1', enabled: true },
                },
            ],
            cursor: new Date(),
        };
    }

    async pushOrder(order: Order): Promise<ErpOrderRef> {
        return { erpOrderId: `erp-${order.orderId}` };
    }

    async pushInventoryDelta(): Promise<void> {}
}
