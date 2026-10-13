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

// The branch-kassa counterpart of ErpPaymentReportedEvent — a cash payment for a ProformaInvoice,
// witnessed at a branch till and reported up to Central via the existing
// recordWitnessedPayment/payment.recorded outbox path (see order-sync.service.ts,
// central.consumer.ts). Same rule #12 constraint: only enqueues, never processes.
export class BranchKassaPaymentEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly proformaInvoiceId: number,
        // Same organization-scope validation as ErpPaymentReportedEvent — the branch reporting
        // this cash payment already knows its own organization context; this is validated
        // against the target ProformaInvoice's real organizationId, never used to restrict which
        // branch may pay which proforma invoice (branch governs staff visibility, not allocation scope).
        public readonly organizationId: number,
        public readonly outcome: ErpPaymentOutcome,
        public readonly sourceEventId: string,
        // RRN (Retrieval Reference Number) — the standard 12-digit reference printed on a card
        // terminal/kassa receipt, used to identify the transaction with the acquiring bank. Not
        // every branch-kassa fact carries one (e.g. a pure cash payment has no card network
        // involved), hence optional.
        public readonly rrn?: string,
    ) {
        super();
    }
}
