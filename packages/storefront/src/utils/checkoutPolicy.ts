import type { PaymentForm } from 'shared';

export const PAYMENT_FORM_ORDER: PaymentForm[] = ['bank-transfer', 'card', 'cash'];

export const METHOD_CODE_BY_FORM: Record<PaymentForm, string> = {
    cash: 'cash',
    'bank-transfer': 'offline-terms',
    card: 'online-stub',
};

// Mirrors CREDIT_ACKNOWLEDGED_KEY in `shared` (a runtime import would pull the CJS package into the bundle).
export const CREDIT_ACKNOWLEDGED_KEY = 'creditLimitAcknowledged';

export interface CreditPolicyPreview {
    exceeded: boolean;
    limitControlled: boolean;
    allowExceedingCreditLimit: boolean;
    acknowledgementRequired: boolean;
    payableCardAmount: number;
    availableForms: string[];
}

export function orderedForms(available: string[]): PaymentForm[] {
    return PAYMENT_FORM_ORDER.filter(form => available.includes(form));
}

// A card payment covers the excess plus the order, so only cash and bank transfer need the acknowledgement.
export function acknowledgementNeeded(
    preview: CreditPolicyPreview | null,
    form: PaymentForm | null,
): boolean {
    return preview?.acknowledgementRequired === true && form !== null && form !== 'card';
}

export function waitsForManager(
    preview: CreditPolicyPreview | null,
    form: PaymentForm | null,
): boolean {
    return (
        acknowledgementNeeded(preview, form) &&
        preview?.limitControlled === true &&
        preview.allowExceedingCreditLimit === false
    );
}

// Rubles the card payment charges on top of the order total (the debt above the limit).
export function cardExcess(payableCardAmount: number, orderTotal: number): number {
    const excess = Math.round((payableCardAmount - orderTotal) * 100) / 100;
    return excess > 0 ? excess : 0;
}

export function placementMetadata(acknowledged: boolean): Record<string, boolean> {
    return acknowledged ? { [CREDIT_ACKNOWLEDGED_KEY]: true } : {};
}

export interface ProformaInvoiceRef {
    id: string;
    status: string;
    document?: { status: string; asset?: { source: string } | null } | null;
}

export type ProformaPrintTarget = { kind: 'pdf'; url: string } | { kind: 'page'; id: string };

export function proformaDocumentUrl(proforma: ProformaInvoiceRef): string | null {
    return proforma.document?.status === 'ready' ? (proforma.document.asset?.source ?? null) : null;
}

// Bank transfer opens each current proforma invoice: its PDF when ready, otherwise the printable page.
export function proformaPrintTargets(
    form: PaymentForm,
    proformas: ProformaInvoiceRef[],
): ProformaPrintTarget[] {
    if (form !== 'bank-transfer') return [];
    return proformas
        .filter(i => i.status !== 'cancelled' && i.status !== 'superseded')
        .map(i => {
            const url = proformaDocumentUrl(i);
            return url ? { kind: 'pdf', url } : { kind: 'page', id: i.id };
        });
}

// Mirror EXPECTED_AMOUNT_KEY and CARD_AMOUNT_CHANGED_CODE in `shared` (same runtime-import reason as above).
export const EXPECTED_AMOUNT_KEY = 'expectedAmountKopecks';
export const CARD_AMOUNT_CHANGED_CODE = 'CARD_AMOUNT_CHANGED';

// The amount the customer confirmed on screen travels with the card payment; the server rejects a different one.
export function cardPaymentMetadata(
    status: string,
    payableCardAmount: number | null,
): Record<string, string | number> {
    return payableCardAmount === null
        ? { status }
        : { status, [EXPECTED_AMOUNT_KEY]: Math.round(payableCardAmount * 100) };
}

export function isCardAmountChanged(message: string | null | undefined): boolean {
    return message?.startsWith(CARD_AMOUNT_CHANGED_CODE) === true;
}
