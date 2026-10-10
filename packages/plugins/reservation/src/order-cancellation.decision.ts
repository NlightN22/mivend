export type CancelSubmission = 'none' | 'pending' | 'sent';

export type CancelRefusal =
    | 'shipped'
    | 'in-progress'
    | 'paid'
    | 'refused-by-erp'
    | 'registration-rejected';

export interface CancelFacts {
    orderState: string;
    erpStatus: string | null;
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
    | { action: 'request-and-cancel' }
    | { action: 'request-only' };

const SHIPPED_ORDER_STATES = ['Shipped', 'PartiallyShipped', 'Delivered', 'PartiallyDelivered'];
const SHIPPED_ERP_STATUSES = ['SHIPPED', 'DELIVERED'];
const SHIPPED_FULFILLMENT_STATES = ['Shipped', 'Delivered'];
const IN_PROGRESS_ERP_STATUSES = ['ASSEMBLED'];

// Pure state decision of "what may happen to this order now" (docs/order-contracts.md, "Reserve and
// order cancellation"); the service performs the chosen action under the order's lock.
export function decideCancellation(facts: CancelFacts): CancelDecision {
    if (facts.orderState === 'Cancelled') return { action: 'already-cancelled' };

    const shipped =
        SHIPPED_ORDER_STATES.includes(facts.orderState) ||
        (facts.erpStatus !== null && SHIPPED_ERP_STATUSES.includes(facts.erpStatus)) ||
        (facts.latestFulfillmentState !== null &&
            SHIPPED_FULFILLMENT_STATES.includes(facts.latestFulfillmentState));
    if (shipped) return { action: 'refuse', reason: 'shipped' };

    if (facts.erpStatus !== null && IN_PROGRESS_ERP_STATUSES.includes(facts.erpStatus)) {
        return { action: 'refuse', reason: 'in-progress' };
    }
    if (facts.hasSettledPayment) return { action: 'refuse', reason: 'paid' };
    // At the deadline a rejected order keeps its own rules (#204: notify, then release).
    if (facts.erpStatus === 'REJECTED' && !facts.requestRegistered) {
        return { action: 'refuse', reason: 'registration-rejected' };
    }

    if (facts.cancelRequestStatus === 'REQUESTED') return { action: 'already-requested' };
    if (facts.cancelRequestStatus === 'REFUSED') {
        return { action: 'refuse', reason: 'refused-by-erp' };
    }

    if (facts.erpOrderId) {
        return facts.requestRegistered ? { action: 'request-only' } : { action: 'leave-to-erp' };
    }
    if (facts.submission === 'pending') return { action: 'skip-pending-and-cancel' };
    if (facts.submission === 'sent') return { action: 'request-and-cancel' };
    return { action: 'cancel-without-event' };
}
