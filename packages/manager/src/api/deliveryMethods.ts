import { lazyOptions } from '../utils/lazyLabels';

export type DeliveryMethod = 'pickup' | 'courier';

export const DELIVERY_METHOD_OPTIONS = lazyOptions('orderDetail.delivery', [
    'pickup',
    'courier',
] as const);
