import type { ErpAdapter, ErpChangeSet, ErpOrderRef, Order } from './erp-adapter.interface';

export class StubErpAdapter implements ErpAdapter {
    async fetchChanges(): Promise<ErpChangeSet> {
        return {
            events: [
                {
                    type: 'product.updated',
                    payload: { productId: 'stub-product-1', enabled: true },
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
