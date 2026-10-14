import type { OrderStatusDictionary } from './order-status-dictionary';

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
