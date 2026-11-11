import type { PaymentForm } from 'shared';

export type ConfirmationForm = Exclude<PaymentForm, 'card'>;
export type Fulfillment = 'pickup' | 'delivery';
export type PaymentTerms = 'deferred' | 'no-terms';

export interface PlacementCaseKey {
    form: ConfirmationForm;
    fulfillment: Fulfillment;
    terms: PaymentTerms;
}

export interface PlacementCase extends PlacementCaseKey {
    code: string;
    description: string;
}

export const PLACEMENT_CHECK_STAGE = 'placement';

// The single data table of the confirmation matrix: every axis value with its words; the cases are its product.
const AXES = {
    form: [
        { value: 'cash', label: 'cash' },
        { value: 'bank-transfer', label: 'bank transfer (proforma invoice)' },
    ],
    fulfillment: [
        { value: 'pickup', label: 'pickup' },
        { value: 'delivery', label: 'delivery' },
    ],
    terms: [
        { value: 'deferred', label: 'the buyer has deferred payment terms' },
        { value: 'no-terms', label: 'the buyer has no deferred payment terms' },
    ],
} as const;

export const PLACEMENT_CASES: readonly PlacementCase[] = AXES.form.flatMap(form =>
    AXES.fulfillment.flatMap(fulfillment =>
        AXES.terms.map(terms => ({
            form: form.value,
            fulfillment: fulfillment.value,
            terms: terms.value,
            code: `payment.confirmation.${form.value}.${fulfillment.value}.${terms.value}`,
            description: `Order paid by ${form.label}, with ${fulfillment.label}, when ${terms.label}: what happens at placement if the credit limit is not exceeded (hold = a manager confirms the order first).`,
        })),
    ),
);

export function placementCaseCode(key: PlacementCaseKey): string {
    return `payment.confirmation.${key.form}.${key.fulfillment}.${key.terms}`;
}
