import { adminApi } from './client';

export interface OrderDetailLine {
    id: string;
    quantity: number;
    unitPriceWithTax: number;
    linePriceWithTax: number;
    productVariant: { id: string; name: string; sku: string };
    customFields: { manualUnitPrice: number | null; manualPriceReason: string | null };
}

export interface OrderDetail {
    id: string;
    code: string;
    state: string;
    orderPlacedAt: string | null;
    createdAt: string;
    currencyCode: string;
    subTotalWithTax: number;
    shippingWithTax: number;
    totalWithTax: number;
    customFields: { reservationDays: number | null };
    lines: OrderDetailLine[];
    customer: {
        firstName: string;
        lastName: string;
        counterparty: {
            id: string;
            shortName: string;
            inn: string | null;
            assignedManagerId: string | null;
            priceType: string;
        } | null;
    } | null;
}

// States past which a line-level price can no longer be adjusted from this page (see
// docs/ai/manager-portal-pages/03-order-detail.md, "для уже отгруженных заказов эта колонка
// не показывается вообще, только исторические факты корректировок").
export const NON_EDITABLE_ORDER_STATES = [
    'Shipped',
    'PartiallyShipped',
    'PartiallyDelivered',
    'Delivered',
    'Cancelled',
];

export async function fetchOrderDetail(code: string): Promise<OrderDetail | null> {
    const result = await adminApi<{ visibleOrders: { items: OrderDetail[] } }>(
        `query OrderDetail($code: String!) {
            visibleOrders(options: { take: 1, filter: { code: { eq: $code } } }) {
                items {
                    id
                    code
                    state
                    orderPlacedAt
                    createdAt
                    currencyCode
                    subTotalWithTax
                    shippingWithTax
                    totalWithTax
                    customFields { reservationDays }
                    lines {
                        id
                        quantity
                        unitPriceWithTax
                        linePriceWithTax
                        productVariant { id name sku }
                        customFields { manualUnitPrice manualPriceReason }
                    }
                    customer {
                        firstName
                        lastName
                        counterparty {
                            id
                            shortName
                            inn
                            assignedManagerId
                            priceType
                        }
                    }
                }
            }
        }`,
        { code },
    );
    return result.visibleOrders.items[0] ?? null;
}

export interface PriceAdjustmentRequestSummary {
    id: string;
    payload: string;
    status: string;
    currentStepRole: string | null;
    createdAt: string;
    decidedAt: string | null;
}

export async function fetchPriceAdjustmentRequestsForOrder(
    orderId: string,
): Promise<PriceAdjustmentRequestSummary[]> {
    const result = await adminApi<{
        priceAdjustmentRequestsForOrder: PriceAdjustmentRequestSummary[];
    }>(
        `query PriceAdjustmentRequestsForOrder($orderId: ID!) {
            priceAdjustmentRequestsForOrder(orderId: $orderId) {
                id
                payload
                status
                currentStepRole
                createdAt
                decidedAt
            }
        }`,
        { orderId },
    );
    return result.priceAdjustmentRequestsForOrder;
}

export interface RelatedDocument {
    id: string;
    type: string;
    number: string;
    status: string;
    issueDate: string;
    orderId: string | null;
}

export async function fetchRelatedDocuments(orderId: string): Promise<RelatedDocument[]> {
    const result = await adminApi<{ documents: { items: RelatedDocument[] } }>(
        `query RelatedDocuments($orderId: ID!) {
            documents(options: { take: 100 }, orderId: $orderId) {
                items { id type number status issueDate orderId }
            }
        }`,
        { orderId },
    );
    return result.documents.items;
}
