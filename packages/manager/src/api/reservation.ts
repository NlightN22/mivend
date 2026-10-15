import { adminApi } from './client';
import {
    AvailableStockDocument,
    ConfirmOrderDocument,
    ExtendOrderReservationDocument,
    OrderContractsDocument,
    OrderReservationDetailsDocument,
    OrderReservationsDocument,
    VariantReservationHoldersDocument,
    SetOrderContractDocument,
    ReleaseOrderReservationDocument,
    ReservationExtensionLimitDocument,
    type OrderContractOptionFieldsFragment,
    type OrderReservationDetailsQuery,
    type OrderReservationFieldsFragment,
    type VariantReservationHoldersQuery,
} from './generated/graphql';

export type OrderReservationDetail =
    OrderReservationDetailsQuery['orderReservationDetails'][number];
export type VariantReservationHolder =
    VariantReservationHoldersQuery['variantReservationHolders'][number];

export async function fetchOrderReservationDetails(
    orderId: string,
): Promise<OrderReservationDetail[]> {
    return (await adminApi(OrderReservationDetailsDocument, { orderId })).orderReservationDetails;
}

export async function fetchVariantReservationHolders(
    productVariantId: string,
): Promise<VariantReservationHolder[]> {
    return (await adminApi(VariantReservationHoldersDocument, { productVariantId }))
        .variantReservationHolders;
}

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

// Null means no limit for the role, so the UI must hide extend rather than show a form
// that is always rejected; absence is strict in ReservationService.extendReservation.
export async function fetchReservationExtensionLimit(
    roleCode: string,
): Promise<ReservationExtensionLimit | null> {
    const result = await adminApi(ReservationExtensionLimitDocument, { roleCode });
    return result.reservationExtensionLimit ?? null;
}

export async function fetchAvailableStock(
    productVariantId: string,
    orderId?: string,
): Promise<number> {
    const result = await adminApi(AvailableStockDocument, { productVariantId, orderId });
    return result.availableStock;
}

export type OrderContractOption = OrderContractOptionFieldsFragment;

export async function fetchOrderContracts(orderId: string): Promise<OrderContractOption[]> {
    const result = await adminApi(OrderContractsDocument, { orderId });
    return result.orderContracts;
}

export async function setOrderContract(
    orderId: string,
    contractId: string,
): Promise<OrderContractOption[]> {
    const result = await adminApi(SetOrderContractDocument, { orderId, contractId });
    return result.setOrderContract;
}
