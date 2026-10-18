import { literal, select } from './contour-db';

export interface OrderRow {
    id: string;
    code: string;
    state: string;
    uuid: string;
    reservationState: string | null;
    erpStatus: string | null;
    erpOrderId: string | null;
    cancelRequestStatus: string | null;
}

export interface ReservationRow {
    productVariantId: string;
    quantity: number;
    status: string;
    generation: number;
    handedOver: boolean;
}

export function orderByCode(code: string): OrderRow | undefined {
    return select<OrderRow>(`SELECT id::text, code, state, "customFieldsUuid"::text AS uuid,
        "customFieldsReservationstate" AS "reservationState", "customFieldsErpstatus" AS "erpStatus",
        "customFieldsErporderid" AS "erpOrderId", "customFieldsCancelrequeststatus" AS "cancelRequestStatus"
        FROM "order" WHERE code = ${literal(code)}`)[0];
}

export function reservations(orderId: string): ReservationRow[] {
    return select<ReservationRow>(`SELECT "productVariantId" AS "productVariantId", quantity, status,
        coalesce("reservationGeneration", 1) AS generation, "erpHandedOverAt" IS NOT NULL AS "handedOver"
        FROM reservation WHERE "orderId" = ${literal(orderId)}`);
}

export function outboxRows(orderUuid: string, eventType: string): { status: string }[] {
    return select<{ status: string }>(`SELECT status FROM integration_outbox
        WHERE event_type = ${literal(eventType)} AND payload->>'orderUuid' = ${literal(orderUuid)} ORDER BY id`);
}

export interface InboxRow {
    status: string;
    outcome: string | null;
    payload: {
        status?: string;
        orderEntityId?: string;
        reservedLines?: { productId: string; reservedQuantity?: number }[];
    };
}

export function inboxRows(stream: string, orderUuid: string): InboxRow[] {
    return select<InboxRow>(`SELECT status, outcome, payload FROM integration_inbox_event
        WHERE stream = ${literal(stream)} AND payload->>'orderUuid' = ${literal(orderUuid)} ORDER BY id`);
}

export function variantIdsByProductId(productIds: string[]): Map<string, string> {
    if (productIds.length === 0) return new Map();
    const rows = select<{
        productId: string;
        variantId: string;
    }>(`SELECT p."customFieldsExternalid" AS "productId",
        pv.id::text AS "variantId" FROM product_variant pv JOIN product p ON p.id = pv."productId"
        WHERE p."customFieldsExternalid" IN (${productIds.map(literal).join(',')})`);
    return new Map(rows.map(r => [r.productId, r.variantId]));
}

export function mismatchIssues(
    orderId: string,
): { productVariantId: string; localQuantity: number; erpQuantity: number }[] {
    return select(`SELECT "productVariantId" AS "productVariantId", "localQuantity" AS "localQuantity",
        "erpQuantity" AS "erpQuantity" FROM reservation_reconciliation_issue
        WHERE "orderId" = ${literal(orderId)} AND "issueType" = 'QUANTITY_MISMATCH'`);
}
