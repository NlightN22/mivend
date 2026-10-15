import { adminApi } from './client';
import {
    OrderDetailDocument,
    PriceAdjustmentRequestsForOrderDocument,
    RelatedDocumentsDocument,
    type OrderDetailQuery,
} from './generated/graphql';

type RawOrderDetail = OrderDetailQuery['visibleOrders']['items'][number];
type RawOrderDetailLine = RawOrderDetail['lines'][number];

export type OrderDetailLine = Omit<RawOrderDetailLine, 'customFields' | 'productVariant'> & {
    customFields: NonNullable<RawOrderDetailLine['customFields']>;
    productVariant: Omit<RawOrderDetailLine['productVariant'], 'customFields'> & {
        customFields: NonNullable<RawOrderDetailLine['productVariant']['customFields']>;
    };
};
export type OrderDetail = Omit<RawOrderDetail, 'customFields' | 'lines'> & {
    customFields: NonNullable<RawOrderDetail['customFields']>;
    lines: OrderDetailLine[];
};

// GraphQL schema marks customFields wrappers nullable, but Vendure always returns them in practice.
// Custom fields default to null values, never a missing object, so one normalization is enough.
function normalizeOrderDetail(order: RawOrderDetail): OrderDetail {
    return {
        ...order,
        customFields: order.customFields ?? {
            reservationDays: null,
            reservationFailureReason: null,
            reservationFailureDetail: null,
            reservationFailedAt: null,
            erpStatus: null,
            erpOrderId: null,
            erpPaidAmount: null,
            erpRegistrationStatus: null,
            erpRegistrationDocumentNumber: null,
            erpRejectionReasonCode: null,
            erpRejectionReasonText: null,
        },
        lines: order.lines.map(line => ({
            ...line,
            customFields: line.customFields ?? { manualUnitPrice: null, manualPriceReason: null },
            productVariant: {
                ...line.productVariant,
                customFields: line.productVariant.customFields ?? {
                    unitName: null,
                    unitRatioToBase: null,
                    unitWeightKg: null,
                    unitVolumeM3: null,
                },
            },
        })),
    };
}

// Line prices are locked once the order passes these states; this page cannot adjust them.
// Shipped orders hide the price column entirely and show only historical adjustment records.
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
