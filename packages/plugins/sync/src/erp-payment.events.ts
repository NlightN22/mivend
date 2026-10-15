import { RequestContext, VendureEvent } from '@vendure/core';

export type ErpPaymentOutcome = 'success' | 'pending' | 'fail' | 'cancel';

export interface ErpPaymentFact {
    // The proforma invoice's immutable uuid; optional human number must match the document when given.
    proformaInvoiceUuid: string;
    proformaInvoiceNumber?: string;
    // Validated against the document's organization.
    organizationId: number;
    outcome: ErpPaymentOutcome;
    erpEventId: string;
    // What the customer actually paid, integer minor units (> 0): may be partial or exceed the document.
    amount: number;
    currencyCode: string;
}

// A payment document reported by the ERP — never applied directly here. plugin-acquiring subscribes and
// durably enqueues it (the external-integration-rules skill); processing only runs from the inbox worker.
export class ErpPaymentReportedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly fact: ErpPaymentFact,
    ) {
        super();
    }
}

// Enqueue-only (rule #12): Central applies it via the payment.recorded outbox, never here.
// Branch-side cash counterpart of ErpPaymentReportedEvent, reported via recordWitnessedPayment.
export class BranchKassaPaymentEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly proformaInvoiceId: number,
        // Validate against the target ProformaInvoice's real organizationId, not the reporting branch's.
        // Branch scopes staff visibility only; it must never restrict which branch may pay which proforma.
        public readonly organizationId: number,
        public readonly outcome: ErpPaymentOutcome,
        public readonly sourceEventId: string,
        // RRN: 12-digit acquiring-bank reference from the card terminal receipt.
        // Optional: pure cash payments involve no card network, so they have none.
        public readonly rrn?: string,
    ) {
        super();
    }
}
