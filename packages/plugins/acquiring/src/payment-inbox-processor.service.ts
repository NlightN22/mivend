import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { normalizeDocumentNumber } from 'shared';

import { PaymentChannel } from './entities/payment-attempt.entity';
import { InboxService } from './inbox.service';
import { parseProformaNumber } from './proforma-invoice-number';
import { ProformaInvoiceService } from './proforma-invoice.service';
import {
    PayProformaInvoiceOutcome,
    PaymentAttemptService,
    PaymentCurrencyMismatchError,
    PaymentOrganizationMismatchError,
} from './payment-attempt.service';

export class ProformaInvoiceReferenceError extends Error {}

// Retryable: the payment fact may arrive before the document reaches this instance.
export class UnknownProformaInvoiceError extends Error {}

// The uuid is the key: both the versioned number and the stable document part (pre-versioning facts) match.
function acceptedNumbers(number: string): string[] {
    const documentId = parseProformaNumber(number)?.documentId;
    return [number, ...(documentId ? [documentId] : [])].map(normalizeDocumentNumber);
}

export interface IncomingPaymentPayload {
    // The ERP names a document by uuid (+ optional number); a branch reports the internal id.
    proformaInvoiceId?: number;
    proformaInvoiceUuid?: string;
    proformaInvoiceNumber?: string;
    // What was actually paid (minor units) and its currency; absent only on branch-kassa facts, which
    // fall back to the named document's amount.
    amount?: number;
    currencyCode?: string;
    // The organization the reporting side (ERP/branch) believes this payment belongs to.
    // PaymentAttemptService.payProformaInvoice validates this against the target ProformaInvoice's real
    // organizationId before applying — a mismatch is a genuine cross-system discrepancy
    // (PaymentReconciliationIssue), not a rejected/dead-lettered event, since the ERP/branch
    // isn't necessarily lying — its own proformaInvoiceId reference may simply be stale or wrong, and a
    // human needs to reconcile which proforma invoice was actually meant (the external-integration-rules skill).
    organizationId: number;
    outcome: PayProformaInvoiceOutcome;
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
// work (PaymentAttemptService.payProformaInvoice, same atomic/transactional path used everywhere else in
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
        private proformaInvoiceService: ProformaInvoiceService,
    ) {}

    private async resolveProformaInvoiceId(
        ctx: RequestContext,
        payload: IncomingPaymentPayload,
    ): Promise<number> {
        if (!payload.proformaInvoiceUuid) {
            if (payload.proformaInvoiceId !== undefined) return payload.proformaInvoiceId;
            throw new ProformaInvoiceReferenceError('Payment fact names no proforma invoice');
        }
        const document = await this.proformaInvoiceService.findByUuid(
            ctx,
            payload.proformaInvoiceUuid,
        );
        if (!document) {
            throw new UnknownProformaInvoiceError(
                `ProformaInvoice with uuid ${payload.proformaInvoiceUuid} not found on this instance`,
            );
        }
        if (
            payload.proformaInvoiceNumber !== undefined &&
            !acceptedNumbers(document.number).includes(
                normalizeDocumentNumber(payload.proformaInvoiceNumber),
            )
        ) {
            throw new ProformaInvoiceReferenceError(
                `ProformaInvoice ${payload.proformaInvoiceUuid} has number ${document.number}, ` +
                    `but the payment fact declared number ${payload.proformaInvoiceNumber}`,
            );
        }
        return Number(document.id);
    }

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
                    // producer skipped that validation. Dead-letter, don't let payProformaInvoice's
                    // stub-reference default silently paper over invalid inbound data.
                    throw new Error('Inbox event is missing its mandatory externalReference');
                }
                const documentId = await this.resolveProformaInvoiceId(ctx, payload);
                const fact =
                    payload.amount !== undefined && payload.currencyCode
                        ? {
                              amount: payload.amount,
                              currencyCode: payload.currencyCode,
                          }
                        : undefined;
                await this.paymentAttemptService.payProformaInvoice(
                    ctx,
                    documentId,
                    payload.outcome,
                    payload.channel,
                    payload.externalReference,
                    payload.organizationId,
                    fact,
                );
                await this.inboxService.markProcessed(ctx, Number(event.id));
                processed += 1;
            } catch (err) {
                if (
                    err instanceof PaymentOrganizationMismatchError ||
                    err instanceof PaymentCurrencyMismatchError ||
                    err instanceof ProformaInvoiceReferenceError
                ) {
                    // Retrying cannot fix a wrong organization or document reference, so
                    // dead-letter immediately instead of wasting sweep cycles.
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
