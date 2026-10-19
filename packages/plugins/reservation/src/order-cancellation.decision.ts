import type { OrderStatusDictionary } from '@mivend/plugin-erp-order';

export type CancelSubmission = 'none' | 'pending' | 'sent';

export type CancelRefusal = 'shipped' | 'in-progress' | 'paid' | 'registration-rejected';

// Attributes of the order's erpStatus in the status dictionary; null when it has none yet.
export interface ErpStageFacts {
    shipped: boolean;
    warehouseStarted: boolean;
    rejected: boolean;
}

export interface CancelFacts {
    orderState: string;
    erpStatus: ErpStageFacts | null;
    erpOrderId: string | null;
    latestFulfillmentState: string | null;
    hasSettledPayment: boolean;
    cancelRequestStatus: string | null;
    submission: CancelSubmission;
    // false at the reserve deadline: a registered order is left to the ERP's own release job.
    requestRegistered: boolean;
}

export type CancelDecision =
    | { action: 'already-cancelled' }
    | { action: 'already-requested' }
    | { action: 'refuse'; reason: CancelRefusal }
    | { action: 'leave-to-erp' }
    | { action: 'skip-pending-and-cancel' }
    | { action: 'cancel-without-event' }
    | { action: 'cancel-rejected-locally' }
    | { action: 'request-and-cancel' }
    | { action: 'request-only' };

const SHIPPED_ORDER_STATES = ['Shipped', 'PartiallyShipped', 'Delivered', 'PartiallyDelivered'];
const SHIPPED_FULFILLMENT_STATES = ['Shipped', 'Delivered'];

// Pure state decision of "what may happen to this order now" (docs/order-contracts.md, "Reserve and
// order cancellation"); the service performs the chosen action under the order's lock.
function isShipped(facts: CancelFacts): boolean {
    return (
        SHIPPED_ORDER_STATES.includes(facts.orderState) ||
        facts.erpStatus?.shipped === true ||
        (facts.latestFulfillmentState !== null &&
            SHIPPED_FULFILLMENT_STATES.includes(facts.latestFulfillmentState))
    );
}

export type EditRefusal = 'cancelled' | 'shipped' | 'in-progress' | 'sent-to-erp';

// Lines may change until the order is sent to the ERP (#233): the same stage facts as cancellation,
// but a paid order stays editable and an ERP-rejected one (never created there) may be fixed.
export function decideEdit(
    facts: CancelFacts,
): { allowed: true } | { allowed: false; reason: EditRefusal } {
    if (facts.orderState === 'Cancelled') return { allowed: false, reason: 'cancelled' };
    if (isShipped(facts)) return { allowed: false, reason: 'shipped' };
    if (facts.erpStatus?.warehouseStarted === true)
        return { allowed: false, reason: 'in-progress' };
    if (facts.erpStatus?.rejected === true) return { allowed: true };
    if (facts.erpOrderId || facts.submission === 'sent') {
        return { allowed: false, reason: 'sent-to-erp' };
    }
    return { allowed: true };
}

export function decideCancellation(facts: CancelFacts): CancelDecision {
    if (facts.orderState === 'Cancelled') return { action: 'already-cancelled' };

    if (isShipped(facts)) return { action: 'refuse', reason: 'shipped' };

    if (facts.erpStatus?.warehouseStarted === true) {
        return { action: 'refuse', reason: 'in-progress' };
    }
    if (facts.hasSettledPayment) return { action: 'refuse', reason: 'paid' };
    // At the deadline a rejected order keeps its own rules (#204: notify, then release).
    if (facts.erpStatus?.rejected === true && !facts.requestRegistered) {
        return { action: 'refuse', reason: 'registration-rejected' };
    }
    // The ERP never created a rejected order, so there is nothing to ask it to cancel.
    if (facts.erpStatus?.rejected === true) return { action: 'cancel-rejected-locally' };

    // A refused request (REFUSED) does not block: the customer or staff may ask again.
    if (facts.cancelRequestStatus === 'REQUESTED') return { action: 'already-requested' };

    if (facts.erpOrderId) {
        return facts.requestRegistered ? { action: 'request-only' } : { action: 'leave-to-erp' };
    }
    if (facts.submission === 'pending') return { action: 'skip-pending-and-cancel' };
    if (facts.submission === 'sent') return { action: 'request-and-cancel' };
    return { action: 'cancel-without-event' };
}

const ACTIVE_CART_STATES = ['AddingItems', 'ArrangingPayment'];

// The single answer to "may the customer or staff cancel this order now", exposed as Order.cancellable.
export function isOrderCancellable(facts: CancelFacts): boolean {
    if (ACTIVE_CART_STATES.includes(facts.orderState)) return false;
    const { action } = decideCancellation(facts);
    return !['refuse', 'already-cancelled', 'already-requested', 'leave-to-erp'].includes(action);
}

export function erpStageFacts(
    dictionary: OrderStatusDictionary,
    code: string | null | undefined,
): ErpStageFacts | null {
    const entry = dictionary.get(code);
    return (
        entry && {
            shipped: entry.shipped,
            warehouseStarted: entry.warehouseStarted,
            rejected: entry.rejected,
        }
    );
}
