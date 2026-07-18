import { adminApi } from './client';

export type ReservationStatus = 'active' | 'released' | 'expired';

export interface OrderReservation {
    id: string;
    orderLineId: string;
    productVariantId: string;
    quantity: number;
    status: ReservationStatus;
    reservedAt: string;
    expiresAt: string;
    releasedAt: string | null;
}

const RESERVATION_FIELDS = `
    id
    orderLineId
    productVariantId
    quantity
    status
    reservedAt
    expiresAt
    releasedAt
`;

export async function fetchOrderReservations(orderId: string): Promise<OrderReservation[]> {
    const result = await adminApi<{ orderReservations: OrderReservation[] }>(
        `query OrderReservations($orderId: ID!) { orderReservations(orderId: $orderId) { ${RESERVATION_FIELDS} } }`,
        { orderId },
    );
    return result.orderReservations;
}

export async function confirmOrder(
    orderId: string,
    reservationDays: number,
): Promise<OrderReservation[]> {
    const result = await adminApi<{ confirmOrder: OrderReservation[] }>(
        `mutation($orderId: ID!, $reservationDays: Int!) {
            confirmOrder(orderId: $orderId, reservationDays: $reservationDays) { ${RESERVATION_FIELDS} }
        }`,
        { orderId, reservationDays },
    );
    return result.confirmOrder;
}

export async function releaseOrderReservation(orderId: string): Promise<number> {
    const result = await adminApi<{ releaseOrderReservation: number }>(
        `mutation($orderId: ID!) { releaseOrderReservation(orderId: $orderId) }`,
        { orderId },
    );
    return result.releaseOrderReservation;
}

export async function extendOrderReservation(
    orderId: string,
    additionalDays: number,
): Promise<OrderReservation[]> {
    const result = await adminApi<{ extendOrderReservation: OrderReservation[] }>(
        `mutation($orderId: ID!, $additionalDays: Int!) {
            extendOrderReservation(orderId: $orderId, additionalDays: $additionalDays) { ${RESERVATION_FIELDS} }
        }`,
        { orderId, additionalDays },
    );
    return result.extendOrderReservation;
}

export interface ReservationExtensionLimit {
    roleCode: string;
    maxExtraDays: number;
}

// Returns null when the caller's role has no configured limit — the UI should hide the extend
// action entirely rather than show a form that will always be rejected (see
// ReservationService.extendReservation's "absence-is-strict" convention).
export async function fetchReservationExtensionLimit(
    roleCode: string,
): Promise<ReservationExtensionLimit | null> {
    const result = await adminApi<{ reservationExtensionLimit: ReservationExtensionLimit | null }>(
        `query($roleCode: String!) { reservationExtensionLimit(roleCode: $roleCode) { roleCode maxExtraDays } }`,
        { roleCode },
    );
    return result.reservationExtensionLimit;
}

export async function fetchAvailableStock(productVariantId: string): Promise<number> {
    const result = await adminApi<{ availableStock: number }>(
        `query($productVariantId: ID!) { availableStock(productVariantId: $productVariantId) }`,
        { productVariantId },
    );
    return result.availableStock;
}
