import type { Finding } from '@mivend/plugin-checks';

import type { PlacementCase, PlacementCaseKey } from './placement-cases';

export const PLACEMENT_CONFIRMATION_MESSAGE_KEY = 'payment.confirmation.case';

export function isSameCase(a: PlacementCaseKey, b: PlacementCaseKey): boolean {
    return a.form === b.form && a.fulfillment === b.fulfillment && a.terms === b.terms;
}

// A fact only: the order being placed falls into this case. The consequence is the case's policy row.
export function evaluatePlacementCase(
    own: PlacementCase,
    input: PlacementCaseKey | null | undefined,
): Finding[] {
    if (!input || !isSameCase(own, input)) return [];
    return [
        {
            severity: 'info',
            messageKey: PLACEMENT_CONFIRMATION_MESSAGE_KEY,
            facts: { form: own.form, fulfillment: own.fulfillment, terms: own.terms },
        },
    ];
}
