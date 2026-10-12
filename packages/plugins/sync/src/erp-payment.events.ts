import { RequestContext, VendureEvent } from '@vendure/core';

export type ErpPaymentOutcome = 'success' | 'pending' | 'fail' | 'cancel';

// A payment fact reported by the ERP for a ProformaInvoice (plugin-acquiring's model) — never applied
// directly here. plugin-acquiring subscribes and durably enqueues it (the external-integration-rules skill);
// the risky processing (PaymentAttemptService.payProformaInvoice) only ever runs from the inbox worker.
export class ErpPaymentReportedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        // The proforma invoice's immutable uuid; the optional number is a human reference that
        // must match the document when given.
        public readonly proformaInvoiceUuid: string,
        // The organization the reporting side (the ERP) believes this payment belongs to — validated
        // against the target ProformaInvoice's real organizationId before applying (the external-integration-rules
        // skill's external-reference-id rule). Payment allocation is scoped by organization only; branch is a visibility
        // concern, never an allocation boundary — see docs/payments.md "Organizations".
        public readonly organizationId: number,
        public readonly outcome: ErpPaymentOutcome,
        public readonly erpEventId: string,
        public readonly proformaInvoiceNumber?: string,
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
