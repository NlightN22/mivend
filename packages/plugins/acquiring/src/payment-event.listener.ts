import { createHash } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import { subscribeAndLog } from 'shared';
import { BranchKassaPaymentEvent, ErpPaymentReportedEvent } from '@mivend/plugin-sync';

import { PaymentChannel } from './entities/payment-attempt.entity';
import { InboxService } from './inbox.service';
import { IncomingPaymentPayload } from './payment-inbox-processor.service';

const loggerCtx = 'PaymentEventListener';

// Distinct from IncomingPaymentPayload: externalReference may be absent for rejected payloads,
// but it must always be stored as received (no-silent-drops invariant), never omitted.
interface StoredPaymentPayload {
    proformaInvoiceId?: number;
    proformaInvoiceUuid?: string;
    proformaInvoiceNumber?: string;
    amount?: number;
    currencyCode?: string;
    organizationId: number;
    outcome: string;
    channel: PaymentChannel;
    externalReference?: string;
}

// Identity fields only: an optional, descriptive proformaInvoiceNumber must not change the hash.
function hashPayload(payload: StoredPaymentPayload): string {
    const identity = { ...payload, proformaInvoiceNumber: undefined };
    return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

// Must not call PaymentAttemptService.payProformaInvoice directly (async-inbox rule):
// events are durably enqueued, and PaymentInboxWorker's sweep does the risky processing.
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
                const fact = event.fact;
                const payload: IncomingPaymentPayload = {
                    proformaInvoiceUuid: fact.proformaInvoiceUuid,
                    proformaInvoiceNumber: fact.proformaInvoiceNumber,
                    amount: fact.amount,
                    currencyCode: fact.currencyCode,
                    organizationId: fact.organizationId,
                    outcome: fact.outcome,
                    channel: 'bank-transfer-erp' satisfies PaymentChannel,
                    externalReference: fact.erpEventId,
                };
                await this.inboxService.enqueue(
                    event.ctx,
                    'erp',
                    fact.erpEventId,
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
                    proformaInvoiceId: event.proformaInvoiceId,
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
                    // Required to reconcile with the branch kassa system (RRN for card, fiscal receipt no. for cash).
                    // Reject rather than process a payment with no reference.
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
