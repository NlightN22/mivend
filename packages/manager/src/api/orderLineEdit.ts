import { adminApi } from './client';
import {
    ChangeOrderLineQuantityDocument,
    OrderLineAvailabilityDocument,
    RemoveOrderLineDocument,
    SplitOrderLinesByStockDocument,
    type OrderLineAvailabilityFieldsFragment,
    type SplitOrderLinesByStockMutation,
} from './generated/graphql';

export type OrderLineAvailability = OrderLineAvailabilityFieldsFragment;
export type SplitOutcome = SplitOrderLinesByStockMutation['splitOrderLinesByStock'][number];

export async function fetchOrderLineAvailability(
    orderId: string,
): Promise<OrderLineAvailability[]> {
    return (await adminApi(OrderLineAvailabilityDocument, { orderId })).orderLineAvailability;
}

export async function changeOrderLineQuantity(
    orderId: string,
    orderLineId: string,
    quantity: number,
): Promise<void> {
    await adminApi(ChangeOrderLineQuantityDocument, { orderId, orderLineId, quantity });
}

export async function removeOrderLine(orderId: string, orderLineId: string): Promise<void> {
    await adminApi(RemoveOrderLineDocument, { orderId, orderLineId });
}

export async function splitOrderLinesByStock(orderId: string): Promise<SplitOutcome[]> {
    return (await adminApi(SplitOrderLinesByStockDocument, { orderId })).splitOrderLinesByStock;
}
