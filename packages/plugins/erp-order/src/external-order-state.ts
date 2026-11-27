import type { OrderStatusDictionary } from './order-status-dictionary';

// A not-posted order is cancelled; a later posted event reopens it only when posting was the sole reason.
export function nextExternalStatusWithPosting(
    current: { erpStatus: string | null; erpIsPosted: boolean | null },
    incoming: string | null,
    isPosted: boolean | null | undefined,
    dictionary: OrderStatusDictionary,
): string | null {
    if (isPosted === false) {
        const cancelled = dictionary.codeWith('cancelled');
        return current.erpStatus === cancelled ? null : cancelled;
    }
    if (
        isPosted === true &&
        current.erpIsPosted === false &&
        dictionary.has(current.erpStatus, 'cancelled')
    ) {
        return incoming ?? dictionary.codeWith('externalDefault');
    }
    return nextExternalErpStatus(current.erpStatus, incoming, dictionary);
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
