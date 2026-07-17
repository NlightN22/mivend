import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';

import { PaymentChannel } from './entities/payment-attempt.entity';
import { InboxService } from './inbox.service';
import {
    PayInvoiceOutcome,
    PaymentAttemptService,
    PaymentOrganizationMismatchError,
} from './payment-attempt.service';

export interface IncomingPaymentPayload {
    invoiceId: number;
    // The organization the reporting side (ERP/branch) believes this payment belongs to.
    // PaymentAttemptService.payInvoice validates this against the target Invoice's real
    // organizationId before applying — a mismatch is a genuine cross-system discrepancy
    // (PaymentReconciliationIssue), not a rejected/dead-lettered event, since the ERP/branch
    // isn't necessarily lying — its own invoiceId reference may simply be stale or wrong, and a
    // human needs to reconcile which invoice was actually meant (AGENTS.md sync rule #13).
    organizationId: number;
    outcome: PayInvoiceOutcome;
    channel: PaymentChannel;
    // The originating system's own reference for this payment fact — an ERP payment-document id
    // for bank-transfer-erp, or an RRN (Retrieval Reference Number, the standard 12-digit
    // card/terminal transaction reference) for branch-kassa. Stored on PaymentAttempt.
    // providerPaymentId and surfaced to the customer as "External reference". Mandatory — a
    // producer missing this must reject/dead-letter the event itself (PaymentEventListener),
    // never enqueue a row that would reach this processor without one.
    externalReference: string;
}

// The periodic sweep half of the inbox pattern — called by PaymentInboxWorker on a timer (once a
// minute by default). Claims whatever is currently 'pending' and, for each row, does the actual
// work (PaymentAttemptService.payInvoice, same atomic/transactional path used everywhere else in
// this plugin) — never the enqueue side, which must stay fast and separate (see InboxService).
//
// If Central was unreachable when the event was first enqueued, that's moot — enqueue() already
// wrote the row durably before this service ever runs. If processing itself fails partway (the
// scenario docs/payments.md and this session's earlier work addressed with a DB transaction),
// the row is left 'pending' again (via markFailed) and the *next* sweep picks it up — recovery
// is "try again next minute", not a special code path.
@Injectable()
export class PaymentInboxProcessorService {
    constructor(
        private inboxService: InboxService,
        private paymentAttemptService: PaymentAttemptService,
    ) {}

    async processPendingEvents(
        ctx: RequestContext,
        limit = 20,
    ): Promise<{ processed: number; failed: number }> {
        const batch = await this.inboxService.claimBatch(ctx, limit);
        let processed = 0;
        let failed = 0;

        for (const event of batch) {
            try {
                const payload = JSON.parse(event.payload) as IncomingPaymentPayload;
                if (!payload.externalReference) {
                    // Defense in depth: PaymentEventListener should already have rejected this
                    // before it ever became a 'pending' row — a missing reference here means a
                    // producer skipped that validation. Dead-letter, don't let payInvoice's
                    // stub-reference default silently paper over invalid inbound data.
                    throw new Error('Inbox event is missing its mandatory externalReference');
                }
                await this.paymentAttemptService.payInvoice(
                    ctx,
                    payload.invoiceId,
                    payload.outcome,
                    payload.channel,
                    payload.externalReference,
                    payload.organizationId,
                );
                await this.inboxService.markProcessed(ctx, Number(event.id));
                processed += 1;
            } catch (err) {
                if (err instanceof PaymentOrganizationMismatchError) {
                    // A PaymentReconciliationIssue was already recorded (payInvoice) — retrying
                    // won't change which organization the invoice actually belongs to, so
                    // dead-letter immediately rather than wasting sweep cycles (same reasoning as
                    // InboxService.rejectAsInvalid for a missing external reference).
                    await this.inboxService.rejectAsInvalid(ctx, Number(event.id), err.message);
                } else {
                    await this.inboxService.markFailed(ctx, Number(event.id), err as Error);
                }
                failed += 1;
            }
        }

        return { processed, failed };
    }
}
