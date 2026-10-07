export type DeliveryType = 'courier' | 'pickup';

export const SHIPPING_CODE_BY_DELIVERY: Record<DeliveryType, string> = {
    courier: 'freight-delivery',
    pickup: 'pickup',
};
