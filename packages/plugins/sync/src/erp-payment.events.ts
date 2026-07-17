import { RequestContext, VendureEvent } from '@vendure/core';

export type ErpPaymentOutcome = 'success' | 'pending' | 'fail' | 'cancel';

// A payment fact reported by the ERP for an Invoice (plugin-acquiring's model) — never applied
// directly here. plugin-acquiring subscribes and durably enqueues it (AGENTS.md sync rule #12);
// the risky processing (PaymentAttemptService.payInvoice) only ever runs from the inbox worker.
export class ErpPaymentReportedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly invoiceId: number,
        public readonly outcome: ErpPaymentOutcome,
        public readonly erpEventId: string,
    ) {
        super();
    }
}

// The branch-kassa counterpart of ErpPaymentReportedEvent — a cash payment for an Invoice,
// witnessed at a branch till and reported up to Central via the existing
// recordWitnessedPayment/payment.recorded outbox path (see order-sync.service.ts,
// central.consumer.ts). Same rule #12 constraint: only enqueues, never processes.
export class BranchKassaPaymentEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly invoiceId: number,
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
