import type { ID } from '@vendure/common/lib/shared-types';

export type OrderTargetKind =
    | 'order'
    | 'orderLine'
    | 'payment'
    | 'fulfillment'
    | 'refund'
    | 'orderNote';

export type OperationArgs = Record<string, unknown>;

export interface OrderTarget {
    kind: OrderTargetKind;
    ids: (args: OperationArgs) => unknown[];
}

export type CoreOrderOperation =
    | { targets: OrderTarget[] }
    | { scopedResolver: true }
    | { exempt: string };

function input(args: OperationArgs): OperationArgs {
    return (args.input ?? {}) as OperationArgs;
}

function each(list: unknown, key: string): unknown[] {
    return Array.isArray(list) ? list.map(item => (item as OperationArgs)[key]) : [];
}

const byArg = (kind: OrderTargetKind, key: string): OrderTarget => ({
    kind,
    ids: args => [args[key]],
});
const byInput = (kind: OrderTargetKind, key: string): OrderTarget => ({
    kind,
    ids: args => [input(args)[key]],
});
const inOrder = 'reachable only through an already scoped order';
const draft = { targets: [byArg('order', 'orderId')] };

// Every core Admin API operation that takes or returns order data (docs/access-control.md).
export const CORE_ORDER_OPERATIONS: Record<string, CoreOrderOperation> = {
    order: { targets: [byArg('order', 'id')] },
    orders: { scopedResolver: true },
    'Customer.orders': { scopedResolver: true },
    'OrderLine.order': { scopedResolver: true },
    'FulfillmentLine.fulfillment': { exempt: inOrder },
    'OrderModification.payment': { exempt: inOrder },
    'OrderModification.refund': { exempt: inOrder },
    'RefundLine.refund': { exempt: inOrder },
    'InsufficientStockError.order': {
        exempt: 'returns the order the caller just passed the guard for',
    },
    updateCustomerNote: { exempt: 'a customer note, not an order note' },
    eligibleShippingMethodsForDraftOrder: draft,
    settlePayment: { targets: [byArg('payment', 'id')] },
    cancelPayment: { targets: [byArg('payment', 'id')] },
    transitionPaymentToState: { targets: [byArg('payment', 'id')] },
    addFulfillmentToOrder: {
        targets: [{ kind: 'orderLine', ids: args => each(input(args).lines, 'orderLineId') }],
    },
    transitionFulfillmentToState: { targets: [byArg('fulfillment', 'id')] },
    cancelOrder: { targets: [byInput('order', 'orderId')] },
    refundOrder: { targets: [byInput('payment', 'paymentId')] },
    settleRefund: { targets: [byInput('refund', 'id')] },
    addNoteToOrder: { targets: [byInput('order', 'id')] },
    updateOrderNote: { targets: [byInput('orderNote', 'noteId')] },
    deleteOrderNote: { targets: [byArg('orderNote', 'id')] },
    transitionOrderToState: { targets: [byArg('order', 'id')] },
    setOrderCustomFields: { targets: [byInput('order', 'id')] },
    setOrderCustomer: { targets: [byInput('order', 'orderId')] },
    modifyOrder: {
        targets: [
            byInput('order', 'orderId'),
            {
                kind: 'payment',
                ids: args => [
                    ...each(input(args).refunds, 'paymentId'),
                    (input(args).refund as OperationArgs | undefined)?.paymentId,
                ],
            },
        ],
    },
    addManualPaymentToOrder: { targets: [byInput('order', 'orderId')] },
    createDraftOrder: { exempt: 'creates a new order without a customer' },
    deleteDraftOrder: draft,
    addItemToDraftOrder: draft,
    adjustDraftOrderLine: draft,
    removeDraftOrderLine: {
        targets: [byArg('order', 'orderId'), byArg('orderLine', 'orderLineId')],
    },
    setCustomerForDraftOrder: draft,
    setDraftOrderShippingAddress: draft,
    setDraftOrderBillingAddress: draft,
    unsetDraftOrderShippingAddress: draft,
    unsetDraftOrderBillingAddress: draft,
    setDraftOrderCustomFields: draft,
    applyCouponCodeToDraftOrder: draft,
    removeCouponCodeFromDraftOrder: draft,
    setDraftOrderShippingMethod: draft,
};

export function targetIds(target: OrderTarget, args: OperationArgs): ID[] {
    return target
        .ids(args)
        .filter((id): id is ID => typeof id === 'string' || typeof id === 'number');
}
