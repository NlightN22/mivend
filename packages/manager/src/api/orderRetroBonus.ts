import { adminApi } from './client';
import { OrderRetroBonusDocument, type OrderRetroBonusQuery } from './generated/graphql';

export type OrderRetroBonus = OrderRetroBonusQuery['orderRetroBonus'];

export async function fetchOrderRetroBonus(orderId: string): Promise<OrderRetroBonus> {
    return (await adminApi(OrderRetroBonusDocument, { orderId })).orderRetroBonus;
}
