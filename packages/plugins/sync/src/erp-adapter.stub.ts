import type { ErpAdapter, ErpChangeSet, ErpOrderRef, Order } from './erp-adapter.interface';

export class StubErpAdapter implements ErpAdapter {
    async fetchChanges(): Promise<ErpChangeSet> {
        return {
            events: [
                {
                    // productId must be a numeric-string Vendure Product id (the column is
                    // integer) — ProductConsumer.handleProductUpdated passes it straight into a
                    // parameterized SQL UPDATE with no coercion. A non-numeric placeholder like
                    // the previous 'stub-product-1' only ever surfaced as a crash the first time
                    // a branch instance actually consumed it (ProductConsumer.onModuleInit is a
                    // no-op unless instanceType === 'branch', so this never reached real SQL on
                    // central). '1' is a safe no-op on an empty/mismatched dev DB — either
                    // updates a real seeded product or affects zero rows, never throws.
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
