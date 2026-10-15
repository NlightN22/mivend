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
    // Mismatch is a cross-system discrepancy for human reconciliation, not a rejected event:
    // the sender's proformaInvoiceId reference may be stale, so the sender isn't necessarily lying.
    organizationId: number;
    outcome: PayProformaInvoiceOutcome;
    channel: PaymentChannel;
    // Mandatory: rows without it must be rejected upstream in PaymentEventListener, never enqueued.
    // Shown to the customer as 'External reference', so it must be the originating system's own id.
    externalReference: string;
}

// Enqueue already wrote the row durably, so an unreachable Central at enqueue time is moot.
// Failures leave the row 'pending' for the next sweep; retry is the recovery path, by design.
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
                    // Backstop for producers that skip listener validation; a missing reference must not reach
                    // payProformaInvoice, whose stub-reference default would silently mask the invalid input.
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
