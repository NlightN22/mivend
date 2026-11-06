export type DeliveryMethod = 'pickup' | 'courier';

export const DELIVERY_METHOD_OPTIONS = [
    { value: 'pickup', label: 'Self-pickup' },
    { value: 'courier', label: 'Courier delivery' },
] as const;
