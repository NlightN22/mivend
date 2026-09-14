import { adminApi } from './client';
import {
    AvailableStockDocument,
    ConfirmOrderDocument,
    ExtendOrderReservationDocument,
    OrderReservationsDocument,
    ReleaseOrderReservationDocument,
    ReservationExtensionLimitDocument,
    type OrderReservationFieldsFragment,
} from './generated/graphql';

export type ReservationStatus = 'active' | 'released' | 'expired';

export type OrderReservation = Omit<OrderReservationFieldsFragment, 'status'> & {
    status: ReservationStatus;
};

export async function fetchOrderReservations(orderId: string): Promise<OrderReservation[]> {
    const result = await adminApi(OrderReservationsDocument, { orderId });
    return result.orderReservations as OrderReservation[];
}

export async function confirmOrder(
    orderId: string,
    reservationDays: number,
): Promise<OrderReservation[]> {
    const result = await adminApi(ConfirmOrderDocument, { orderId, reservationDays });
    return result.confirmOrder as OrderReservation[];
}

export async function releaseOrderReservation(orderId: string): Promise<number> {
    const result = await adminApi(ReleaseOrderReservationDocument, { orderId });
    return result.releaseOrderReservation;
}

export async function extendOrderReservation(
    orderId: string,
    additionalDays: number,
): Promise<OrderReservation[]> {
    const result = await adminApi(ExtendOrderReservationDocument, { orderId, additionalDays });
    return result.extendOrderReservation as OrderReservation[];
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
    const result = await adminApi(ReservationExtensionLimitDocument, { roleCode });
    return result.reservationExtensionLimit ?? null;
}

export async function fetchAvailableStock(productVariantId: string): Promise<number> {
    const result = await adminApi(AvailableStockDocument, { productVariantId });
    return result.availableStock;
}
