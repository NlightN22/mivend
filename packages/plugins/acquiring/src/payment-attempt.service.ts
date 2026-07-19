import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    PaginatedList,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

import { Invoice } from './entities/invoice.entity';
import { PaymentAttempt, PaymentChannel, PaymentStatus } from './entities/payment-attempt.entity';
import { SettlementEntry } from './entities/settlement-entry.entity';
import { InvoiceService } from './invoice.service';
import { PaymentReconciliationIssueService } from './payment-reconciliation-issue.service';
import { SettlementEntryService } from './settlement-entry.service';

export type PayInvoiceOutcome = 'success' | 'pending' | 'fail' | 'cancel';

const POSTGRES_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
    return (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
    );
}

// Thrown when a payment event's declared organization doesn't match the target invoice's real
// one. Distinct from UserInputError so callers (PaymentInboxProcessorService) can dead-letter
// immediately instead of retrying — a mismatch won't fix itself on the next sweep, the same
// reasoning as InboxService.rejectAsInvalid for a missing external reference.
export class PaymentOrganizationMismatchError extends Error {
    constructor(invoiceId: number, expected: number, actual: number) {
        super(
            `Invoice ${invoiceId} belongs to organization ${actual}, but the payment event ` +
                `declared organization ${expected} — refusing to apply`,
        );
        this.name = 'PaymentOrganizationMismatchError';
    }
}

// Until a real acquirer (Robokassa, per docs/payments.md) is wired in, online-acquiring payments
// still need a mandatory, reconcilable external reference — this stub is deliberately shaped so
// it can never be mistaken for a real acquirer transaction id once one exists.
export function generateStubExternalReference(channel: PaymentChannel, invoiceId: number): string {
    return `STUB-${channel}-${invoiceId}-${Date.now()}`;
}

const OUTCOME_TO_PAYMENT_STATUS: Record<PayInvoiceOutcome, PaymentStatus> = {
    success: 'captured',
    pending: 'pending',
    fail: 'failed',
    cancel: 'canceled',
};

// Field is named "status" (not "paymentStatus") to match the GraphQL PaymentListOptions input
// type exactly (shop.schema.ts) — args.options is passed straight through from the resolver, so
// a name mismatch here silently drops the filter instead of erroring (real bug caught by e2e:
// the status filter chips did nothing at all).
export interface PaymentListOptions {
    take?: number;
    skip?: number;
    status?: string;
    channel?: string;
}

// One row of "what this payment was applied to" — a SettlementEntry that traces back to a
// given PaymentAttempt, joined with the invoice it settled (or partially settled).
export interface PaymentAllocation {
    settlementEntry: SettlementEntry;
    invoice: Invoice | null;
}

// Pays a single Invoice directly — independent of Vendure's Order/Payment/activeOrder
// machinery entirely. An invoice must stay payable at any time, regardless of whether its
// order is still "active" in some browser session (deferred/offline-terms invoices are the
// common case: the order was placed and shipped, payment happens later, on the customer's own
// schedule). This is the demo-stub equivalent of the online-stub payment method handler
// (apps/server/src/payment-method-handlers.ts), but scoped to one invoice, callable any time.
//
// Deliberately does NOT reject a "success" outcome against an already-`paid` invoice — a second
// capture referencing the same invoice (e.g. the customer paid online *and* a bank transfer for
// the same debt is later reported by the ERP) must not error. SettlementEntryService.allocate
// finds no remaining balance on that invoice and cascades the amount to the counterparty's next
// open invoice, or records it as an advance — see docs/payments.md "Cash application".
@Injectable()
export class PaymentAttemptService {
    constructor(
        private connection: TransactionalConnection,
        private invoiceService: InvoiceService,
        private settlementEntryService: SettlementEntryService,
        private reconciliationIssueService: PaymentReconciliationIssueService,
    ) {}

    // expectedOrganizationId is only ever passed by the inbox processor (an event-reported
    // payment claims which organization it's for) — a direct "pay now" GraphQL call has no
    // externally-claimed scope to validate against, since the caller IS the request context's own
    // organization/counterparty already. Payment allocation is scoped by organization only, never
    // by branch (branch governs staff visibility — see AGENTS.md sync rule #13, docs/payments.md
    // "Organizations") — a payment can apply to any invoice within the correct organization
    // regardless of which branch reported it.
    async payInvoice(
        ctx: RequestContext,
        invoiceId: number,
        outcome: PayInvoiceOutcome,
        channel: PaymentChannel = 'online-acquiring',
        externalReference: string = generateStubExternalReference(channel, invoiceId),
        expectedOrganizationId?: number,
    ): Promise<Invoice> {
        const invoice = await this.invoiceService.findOne(ctx, invoiceId);
        if (!invoice) {
            throw new UserInputError(`Invoice ${invoiceId} not found`);
        }
        if (invoice.status === 'cancelled') {
            throw new UserInputError(`Invoice ${invoiceId} is cancelled and cannot be paid`);
        }
        if (
            expectedOrganizationId !== undefined &&
            expectedOrganizationId !== invoice.organizationId
        ) {
            // Not necessarily bad data from the reporting side — the ERP/branch may simply hold
            // a stale/wrong invoiceId reference. A human needs to reconcile which invoice was
            // actually meant, so this is a PaymentReconciliationIssue, not a silent rejection.
            await this.reconciliationIssueService.report(ctx, 'ORGANIZATION_MISMATCH', {
                invoiceId,
                organizationId: expectedOrganizationId,
                providerPaymentId: externalReference,
            });
            throw new PaymentOrganizationMismatchError(
                invoiceId,
                expectedOrganizationId,
                invoice.organizationId,
            );
        }

        const paymentStatus = OUTCOME_TO_PAYMENT_STATUS[outcome];

        // Level 3 idempotency (AGENTS.md rule #13): the same (channel, externalReference) must
        // apply at most once, even across separate payInvoice calls — e.g. the inbox processor
        // retrying an event whose business write already succeeded but whose markProcessed then
        // failed (a genuine partial-failure gap found in this exact method: nothing previously
        // stopped a retried event from creating a second PaymentAttempt for the same real-world
        // payment). Checked *and* enforced: the find-first check handles the common retry case
        // without a wasted failed insert, the unique index + catch below is the hard safety net
        // for a genuine concurrent race (same pattern as InboxService.enqueue).
        const existing = await this.connection
            .getRepository(ctx, PaymentAttempt)
            .findOne({ where: { channel, providerPaymentId: externalReference } });
        if (existing) {
            return (await this.invoiceService.findOne(ctx, Number(invoice.id)))!;
        }

        // Atomic: the PaymentAttempt row and everything allocate() writes (SettlementEntry rows,
        // invoice status flips) commit together or not at all. Without this, a crash between
        // "PaymentAttempt saved" and "allocation finished" would leave an orphaned PaymentAttempt
        // that no SettlementEntry ever references — money recorded as captured but reflected
        // nowhere, with no way to resume automatically. With the transaction, that state can
        // never exist on disk: the caller either sees the whole operation succeed, or sees it
        // throw and can safely call payInvoice again — nothing partial to reconcile.
        try {
            await this.connection.withTransaction(ctx, async transactionCtx => {
                const repo = this.connection.getRepository(transactionCtx, PaymentAttempt);
                const paymentAttempt = await repo.save(
                    repo.create({
                        channel,
                        invoiceId: Number(invoice.id),
                        orderId: invoice.orderId,
                        amount: invoice.amount,
                        currencyCode: invoice.currencyCode,
                        paymentStatus,
                        providerPaymentId: externalReference,
                    }),
                );

                if (paymentStatus === 'captured') {
                    await this.settlementEntryService.allocate(transactionCtx, paymentAttempt);
                } else if (paymentStatus === 'pending' && invoice.status === 'pending') {
                    await this.invoiceService.updateStatus(
                        transactionCtx,
                        Number(invoice.id),
                        'issued',
                    );
                }
                // 'failed'/'canceled' leave Invoice.status untouched — retryable, same semantics
                // as a Declined order-level payment (updateStatusForOrder's decline branch never
                // runs either). A cancellation means the attempt never actually completed —
                // nothing to reverse financially (docs/payments.md: "Cancellation ... Nothing to
                // reverse financially; the attempt simply never completed").
            });
        } catch (err) {
            if (!isUniqueViolation(err)) throw err;
            // Lost a race with a concurrent payInvoice call for the same (channel,
            // externalReference) — the row it created is the real, already-applied payment;
            // nothing left to do here.
        }

        return (await this.invoiceService.findOne(ctx, Number(invoice.id)))!;
    }

    async findOne(ctx: RequestContext, id: number): Promise<PaymentAttempt | null> {
        return this.connection.getRepository(ctx, PaymentAttempt).findOne({ where: { id } });
    }

    // Real per-order "how much has actually been captured" for the manager portal's order
    // lists (see CustomerOrdersTab.vue's Payment column) — sums only `paymentStatus = 'captured'`
    // rows, never 'authorized'/'pending' (money not yet actually received) or 'failed'/'canceled'
    // (never received at all). Deliberately does NOT net out refunds/disputes/chargebacks here —
    // this is a simple list-badge read, not a reconciliation feature; a fully-refunded order
    // will still sum as fully captured. If this ever backs a real accounting decision instead of
    // a badge, that gap needs closing first (see AGENTS.md rule #11 on refunds/disputes being
    // their own lifecycle, never netted against a payment record).
    // Batched (one query for every orderId a table page needs) rather than per-row, to avoid
    // N+1 queries against a list of ~20 orders.
    async sumCapturedAmountsByOrderIds(
        ctx: RequestContext,
        orderIds: number[],
    ): Promise<Map<number, number>> {
        const result = new Map<number, number>();
        if (!orderIds.length) return result;
        const rows = await this.connection
            .getRepository(ctx, PaymentAttempt)
            .createQueryBuilder('payment')
            .select('payment.orderId', 'orderId')
            .addSelect('SUM(payment.amount)', 'capturedAmount')
            .where('payment.orderId IN (:...orderIds)', { orderIds })
            .andWhere('payment.paymentStatus = :status', {
                status: 'captured' satisfies PaymentStatus,
            })
            .groupBy('payment.orderId')
            .getRawMany<{ orderId: number; capturedAmount: string }>();
        for (const row of rows) {
            result.set(row.orderId, Number(row.capturedAmount));
        }
        return result;
    }

    // Ownership check for the `payment(id)` query — a payment belongs to a counterparty via its
    // target invoice (same join reasoning as findForCounterparty).
    async belongsToCounterparty(
        ctx: RequestContext,
        payment: PaymentAttempt,
        counterpartyId: ID,
    ): Promise<boolean> {
        if (!payment.invoiceId) return false;
        const invoice = await this.connection
            .getRepository(ctx, Invoice)
            .findOne({ where: { id: payment.invoiceId } });
        return invoice?.counterpartyId === Number(counterpartyId);
    }

    // Scoped to a counterparty via a join through Invoice — PaymentAttempt itself carries no
    // counterpartyId (only invoiceId/orderId), Invoice is the single source of truth for which
    // counterparty/organization a payment belongs to (same reasoning as Invoice.organizationId).
    async findForCounterparty(
        ctx: RequestContext,
        counterpartyId: ID,
        options?: PaymentListOptions,
    ): Promise<PaginatedList<PaymentAttempt>> {
        const take = options?.take ?? 50;
        const skip = options?.skip ?? 0;

        const qb = this.connection
            .getRepository(ctx, PaymentAttempt)
            .createQueryBuilder('payment')
            .innerJoin(Invoice, 'invoice', 'invoice.id = payment.invoiceId')
            .where('invoice.counterpartyId = :counterpartyId', {
                counterpartyId: Number(counterpartyId),
            })
            .orderBy('payment.createdAt', 'DESC')
            .addOrderBy('payment.id', 'DESC')
            .take(take)
            .skip(skip);

        if (options?.status) {
            qb.andWhere('payment.paymentStatus = :paymentStatus', {
                paymentStatus: options.status,
            });
        }
        if (options?.channel) {
            qb.andWhere('payment.channel = :channel', { channel: options.channel });
        }

        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    // What a given payment was actually applied to — one row per SettlementEntry it produced
    // (the target invoice first, then any FIFO overflow, then a final advance row with no
    // invoice). Reused by the payment detail page's "Invoice allocation" table.
    async getAllocationsForPayment(
        ctx: RequestContext,
        paymentAttemptId: number,
    ): Promise<PaymentAllocation[]> {
        const entries = await this.connection
            .getRepository(ctx, SettlementEntry)
            .find({ where: { sourcePaymentId: paymentAttemptId }, order: { id: 'ASC' } });
        const allocations: PaymentAllocation[] = [];
        for (const entry of entries) {
            const invoice = entry.invoiceId
                ? await this.connection
                      .getRepository(ctx, Invoice)
                      .findOne({ where: { id: entry.invoiceId } })
                : null;
            allocations.push({ settlementEntry: entry, invoice });
        }
        return allocations;
    }
}
