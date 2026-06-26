import type { Order } from '@mivend/plugin-sync';
import type { OnecOrder } from '../types';

export function mapOrderTo1c(order: Order): Partial<OnecOrder> {
    return {
        Номер: order.orderId,
        Дата: new Date().toISOString(),
    };
}
