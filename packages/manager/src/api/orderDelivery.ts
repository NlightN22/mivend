import { adminApi } from './client';
import { SetOrderDeliveryDocument } from './generated/graphql';

export async function setOrderDelivery(
    orderId: string,
    method: 'pickup' | 'courier',
    tradingPointId: string | null,
): Promise<void> {
    await adminApi(SetOrderDeliveryDocument, {
        orderId,
        method: method === 'courier' ? 'COURIER' : 'PICKUP',
        tradingPointId,
    });
}
