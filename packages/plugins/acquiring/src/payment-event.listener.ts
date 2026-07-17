import { createHash } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import { subscribeAndLog } from 'shared';
import { BranchKassaPaymentEvent, ErpPaymentReportedEvent } from '@mivend/plugin-sync';

import { PaymentChannel } from './entities/payment-attempt.entity';
import { InboxService } from './inbox.service';
import { IncomingPaymentPayload } from './payment-inbox-processor.service';

const loggerCtx = 'PaymentEventListener';

// Storage shape only, distinct from IncomingPaymentPayload — externalReference may be absent
// here (a payload that's about to be rejected as invalid), but is always durably recorded as
// received (AGENTS.md sync rule #4), never silently omitted from the row.
interface StoredPaymentPayload {
    invoiceId: number;
    organizationId: number;
    outcome: string;
    channel: PaymentChannel;
    externalReference?: string;
}

function hashPayload(payload: StoredPaymentPayload): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

// Subscribes only — never calls PaymentAttemptService.payInvoice directly (AGENTS.md sync rule
// #12). Each event is durably enqueued into IncomingPaymentEvent; PaymentInboxWorker's periodic
// sweep does the actual, risky processing.
@Injectable()
export class PaymentEventListener implements OnModuleInit {
    constructor(
        private eventBus: EventBus,
        private inboxService: InboxService,
    ) {}

    onModuleInit(): void {
        subscribeAndLog(
            this.eventBus,
            ErpPaymentReportedEvent,
            async event => {
                const payload: IncomingPaymentPayload = {
                    invoiceId: event.invoiceId,
                    organizationId: event.organizationId,
                    outcome: event.outcome,
                    channel: 'bank-transfer-erp' satisfies PaymentChannel,
                    externalReference: event.erpEventId,
                };
                await this.inboxService.enqueue(
                    event.ctx,
                    'erp',
                    event.erpEventId,
                    hashPayload(payload),
                    payload,
                );
            },
            loggerCtx,
        );

        subscribeAndLog(
            this.eventBus,
            BranchKassaPaymentEvent,
            async event => {
                const payload: StoredPaymentPayload = {
                    invoiceId: event.invoiceId,
                    organizationId: event.organizationId,
                    outcome: event.outcome,
                    channel: 'branch-kassa' satisfies PaymentChannel,
                    externalReference: event.rrn ?? undefined,
                };
                const row = await this.inboxService.enqueue(
                    event.ctx,
                    'branch-kassa',
                    event.sourceEventId,
                    hashPayload(payload),
                    payload,
                );
                if (!event.rrn) {
                    // Mandatory requisite (RRN for a card-processed kassa payment, or the
                    // kassa's own fiscal receipt number for cash) — without it this payment can
                    // never be reconciled against the branch's kassa system. Reject rather than
                    // silently processing it with no reference.
                    await this.inboxService.rejectAsInvalid(
                        event.ctx,
                        Number(row.id),
                        'Missing mandatory external reference (RRN/kassa receipt) for branch-kassa payment fact',
                    );
                }
            },
            loggerCtx,
        );
    }
}
