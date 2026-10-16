export const ORDER_SUBJECT_TYPE = 'order';

export const ORDER_CHECK_STAGES = [
    'cart',
    'checkout',
    'pre-reserve',
    'pre-send-to-erp',
    'on-edit',
] as const;

export type OrderCheckStage = (typeof ORDER_CHECK_STAGES)[number];

export interface OrderCheckLine {
    lineId: string;
    productVariantId: string;
    sku: string;
    productErpId: string | null;
    // ERP id of the one organization the line is sold by (its stamped organization); null when unknown.
    organizationErpId: string | null;
    quantity: number;
    // The ERP does not publish a product's storage unit yet; 1 means the stock is kept in the base unit.
    storageUnitRatioToBase: number;
}

export interface OrderCheckSubject {
    orderId: string;
    orderCode: string;
    customerId: string | null;
    buyerCounterpartyId: string | null;
    warehouseErpId: string | null;
    lines: OrderCheckLine[];
}

// One warehouse per order, the one holding the most quantity, ties broken by id (the order.confirmed rule).
export function pickOrderWarehouse(quantityByWarehouse: Map<string, number>): string | null {
    const sorted = [...quantityByWarehouse.entries()].sort(
        ([idA, qtyA], [idB, qtyB]) => qtyB - qtyA || (idA < idB ? -1 : 1),
    );
    return sorted[0]?.[0] ?? null;
}

export function orderLockKey(orderId: string): string {
    return `reserve-order:${orderId}`;
}
