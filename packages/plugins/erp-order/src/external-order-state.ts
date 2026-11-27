import type { OrderStatusDictionary } from './order-status-dictionary';

export interface PostingState {
    erpStatus: string | null;
    erpIsPosted: boolean | null;
    erpStatusBeforeUnposted: string | null;
}

export interface PostingPlan {
    status: string | null;
    // undefined leaves the stored value; null clears it.
    facts: { erpIsPosted?: boolean | null; erpStatusBeforeUnposted?: string | null };
}

export const NEW_ORDER_POSTING: PostingState = {
    erpStatus: null,
    erpIsPosted: null,
    erpStatusBeforeUnposted: null,
};

// Not posted cancels and remembers the old status; posted restores it. A genuine ERP cancel is terminal
// (the flag becomes null so a later posted event cannot reopen it).
export function planExternalStatus(
    current: PostingState,
    incoming: string | null,
    isPosted: boolean | null | undefined,
    dictionary: OrderStatusDictionary,
): PostingPlan {
    const cancelledNow = dictionary.has(current.erpStatus, 'cancelled');
    if (incoming !== null && dictionary.has(incoming, 'cancelled')) {
        return {
            status: cancelledNow ? null : incoming,
            facts: { erpIsPosted: null, erpStatusBeforeUnposted: null },
        };
    }
    if (isPosted === false) {
        if (cancelledNow) {
            return {
                status: null,
                facts: current.erpIsPosted === false ? { erpIsPosted: false } : {},
            };
        }
        return {
            status: dictionary.codeWith('cancelled'),
            facts: { erpIsPosted: false, erpStatusBeforeUnposted: current.erpStatus },
        };
    }
    if (isPosted === true && current.erpIsPosted === false && cancelledNow) {
        return {
            status:
                current.erpStatusBeforeUnposted ??
                incoming ??
                dictionary.codeWith('externalDefault'),
            facts: { erpIsPosted: true, erpStatusBeforeUnposted: null },
        };
    }
    return {
        status: nextExternalErpStatus(current.erpStatus, incoming, dictionary),
        facts: isPosted === true ? { erpIsPosted: true } : {},
    };
}

// Same forward-only rule as mivend orders. Null means "leave as is".
export function nextExternalErpStatus(
    current: string | null | undefined,
    derived: string | null,
    dictionary: OrderStatusDictionary,
): string | null {
    if (derived === null || dictionary.has(current, 'cancelled')) return null;
    if (dictionary.has(derived, 'cancelled')) return derived;
    return dictionary.canAdvance(current, derived) ? derived : null;
}
