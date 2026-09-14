import { adminApi } from './client';
import {
    OrderDetailDocument,
    PriceAdjustmentRequestsForOrderDocument,
    RelatedDocumentsDocument,
    type OrderDetailQuery,
} from './generated/graphql';

type RawOrderDetail = OrderDetailQuery['visibleOrders']['items'][number];
type RawOrderDetailLine = RawOrderDetail['lines'][number];

export type OrderDetailLine = Omit<RawOrderDetailLine, 'customFields'> & {
    customFields: NonNullable<RawOrderDetailLine['customFields']>;
};
export type OrderDetail = Omit<RawOrderDetail, 'customFields' | 'lines'> & {
    customFields: NonNullable<RawOrderDetail['customFields']>;
    lines: OrderDetailLine[];
};

// Order.customFields/OrderLine.customFields are nullable at the wrapper-object level per the
// GraphQL schema, but Vendure always populates them in practice (custom fields default to null
// values, never a missing object) — normalized here once, same pattern as
// api/customers.ts's normalizeOrderItem.
function normalizeOrderDetail(order: RawOrderDetail): OrderDetail {
    return {
        ...order,
        customFields: order.customFields ?? { reservationDays: null },
        lines: order.lines.map(line => ({
            ...line,
            customFields: line.customFields ?? { manualUnitPrice: null, manualPriceReason: null },
        })),
    };
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
    const result = await adminApi(OrderDetailDocument, { code });
    const order = result.visibleOrders.items[0];
    return order ? normalizeOrderDetail(order) : null;
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
    const result = await adminApi(PriceAdjustmentRequestsForOrderDocument, { orderId });
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
    const result = await adminApi(RelatedDocumentsDocument, { orderId });
    return result.documents.items;
}
