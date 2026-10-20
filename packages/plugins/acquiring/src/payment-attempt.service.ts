import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { withAggregateLock } from 'shared';
import { NumberingService } from '@mivend/plugin-numbering';

import { CONTRACT_PAYMENT_KINDS, ProformaInvoice } from './entities/proforma-invoice.entity';
import { PaymentAttempt, PaymentChannel, PaymentStatus } from './entities/payment-attempt.entity';
import { ProformaInvoiceService } from './proforma-invoice.service';
import { PaymentReconciliationIssueService } from './payment-reconciliation-issue.service';
import { SettlementEntryService } from './settlement-entry.service';
import { shouldResolvePendingAttempt } from './payment-status-transition';

export type PayProformaInvoiceOutcome = 'success' | 'pending' | 'fail' | 'cancel';

const POSTGRES_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
    return (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
    );
}

// Not a UserInputError: callers must dead-letter it, since a mismatch won't fix itself on retry
export class PaymentOrganizationMismatchError extends Error {
    constructor(proformaInvoiceId: number, expected: number, actual: number) {
        super(
            `ProformaInvoice ${proformaInvoiceId} belongs to organization ${actual}, but the payment event ` +
                `declared organization ${expected} — refusing to apply`,
        );
        this.name = 'PaymentOrganizationMismatchError';
    }
}

export class PaymentCurrencyMismatchError extends Error {
    constructor(proformaInvoiceId: number, expected: string, actual: string) {
        super(
            `ProformaInvoice ${proformaInvoiceId} is in ${actual}, but the payment fact is in ` +
                `${expected} — refusing to apply`,
        );
        this.name = 'PaymentCurrencyMismatchError';
    }
}

// The payment document itself: what was actually paid, independent of the named document's amount.
export interface PaymentFact {
    amount: number;
    currencyCode: string;
}

// Until a real acquirer is wired in, online payments need a mandatory external reference.
// The stub's shape must never be mistaken for a real acquirer transaction id.
export function generateStubExternalReference(
    channel: PaymentChannel,
    proformaInvoiceId: number,
): string {
    return `STUB-${channel}-${proformaInvoiceId}-${Date.now()}`;
}

const OUTCOME_TO_PAYMENT_STATUS: Record<PayProformaInvoiceOutcome, PaymentStatus> = {
    success: 'captured',
    pending: 'pending',
    fail: 'failed',
    cancel: 'canceled',
};

// Independent of Vendure's Order/Payment machinery: the proforma must stay payable at any time.
// Never rejects success on an already-paid proforma; allocate() cascades the surplus instead.
@Injectable()
export class PaymentAttemptService {
    constructor(
        private connection: TransactionalConnection,
        private proformaInvoiceService: ProformaInvoiceService,
        private settlementEntryService: SettlementEntryService,
        private reconciliationIssueService: PaymentReconciliationIssueService,
        private numberingService: NumberingService,
    ) {}

    // Only the inbox processor passes expectedOrganizationId; a direct pay call has no external claim.
    // Allocation is scoped by organization only, never branch; branch only governs staff visibility.
    async payProformaInvoice(
        ctx: RequestContext,
        proformaInvoiceId: number,
        outcome: PayProformaInvoiceOutcome,
        channel: PaymentChannel = 'online-acquiring',
        externalReference: string = generateStubExternalReference(channel, proformaInvoiceId),
        expectedOrganizationId?: number,
        fact?: PaymentFact,
    ): Promise<ProformaInvoice> {
        const proformaInvoice = await this.proformaInvoiceService.findOne(ctx, proformaInvoiceId);
        if (!proformaInvoice) {
            throw new UserInputError(`ProformaInvoice ${proformaInvoiceId} not found`);
        }
        if (CONTRACT_PAYMENT_KINDS.includes(proformaInvoice.kind)) {
            throw new UserInputError(`ProformaInvoice ${proformaInvoiceId} takes no payments`);
        }
        if (
            expectedOrganizationId !== undefined &&
            expectedOrganizationId !== proformaInvoice.organizationId
        ) {
            // A stale proformaInvoiceId is likely, so a human must reconcile it rather than silently reject.
            await this.reconciliationIssueService.report(ctx, 'ORGANIZATION_MISMATCH', {
                proformaInvoiceId,
                organizationId: expectedOrganizationId,
                providerPaymentId: externalReference,
            });
            throw new PaymentOrganizationMismatchError(
                proformaInvoiceId,
                expectedOrganizationId,
                proformaInvoice.organizationId,
            );
        }

        if (fact && fact.currencyCode !== proformaInvoice.currencyCode) {
            await this.reconciliationIssueService.report(ctx, 'CURRENCY_MISMATCH', {
                proformaInvoiceId,
                organizationId: proformaInvoice.organizationId,
                providerPaymentId: externalReference,
            });
            throw new PaymentCurrencyMismatchError(
                proformaInvoiceId,
                fact.currencyCode,
                proformaInvoice.currencyCode,
            );
        }
        // A direct "pay now" never pays a cancelled document (a superseded version stays payable); an ERP-reported fact is money already received
        // and is applied by allocate (current version of the chain, else FIFO, else advance).
        if (expectedOrganizationId === undefined) {
            if (proformaInvoice.status === 'cancelled') {
                throw new UserInputError(
                    `ProformaInvoice ${proformaInvoiceId} is cancelled and cannot be paid`,
                );
            }
        }

        const paymentStatus = OUTCOME_TO_PAYMENT_STATUS[outcome];

        // The same (channel, externalReference) must apply at most once, even across retries of an event.
        // Find-first covers retries; the unique index plus catch covers a concurrent race.
        const existing = await this.connection
            .getRepository(ctx, PaymentAttempt)
            .findOne({ where: { channel, providerPaymentId: externalReference } });
        if (existing) {
            await this.applyRepeatDelivery(ctx, proformaInvoice, existing, paymentStatus, fact);
            return (await this.proformaInvoiceService.findOne(ctx, Number(proformaInvoice.id)))!;
        }

        // Must commit atomically with allocate(): a crash between them would leave an orphaned capture.
        // On throw, the caller can safely call again; there is never partial state to reconcile.
        try {
            // The order's proforma lock before any document row: same order as a cancel (docs/concurrency.md).
            await withAggregateLock(
                this.connection,
                ctx,
                `proformaInvoices-for-order:${proformaInvoice.orderId}`,
                async transactionCtx => {
                    // Re-read under the row lock: the checks above ran on a snapshot. A capture skips it, since
                    // allocate() locks the counterparty's open documents in FIFO order and an earlier lock would invert it.
                    const current =
                        paymentStatus === 'captured'
                            ? proformaInvoice
                            : await this.proformaInvoiceService.findOneForUpdate(
                                  transactionCtx,
                                  Number(proformaInvoice.id),
                              );
                    if (expectedOrganizationId === undefined && current.status === 'cancelled') {
                        throw new UserInputError(
                            `ProformaInvoice ${proformaInvoiceId} is cancelled and cannot be paid`,
                        );
                    }
                    const repo = this.connection.getRepository(transactionCtx, PaymentAttempt);
                    const paymentAttempt = await repo.save(
                        repo.create({
                            // Flat sequence, not order-scoped: per docs/identifiers.md, our number
                            // always comes from the sequence; providerPaymentId is the external reference.
                            number: await this.numberingService.next(transactionCtx, 'payment'),
                            channel,
                            proformaInvoiceId: Number(proformaInvoice.id),
                            orderId: proformaInvoice.orderId,
                            amount: fact?.amount ?? current.amount,
                            currencyCode: proformaInvoice.currencyCode,
                            paymentStatus,
                            providerPaymentId: externalReference,
                        }),
                    );

                    if (paymentStatus === 'captured') {
                        await this.settlementEntryService.allocate(transactionCtx, paymentAttempt);
                    } else if (paymentStatus === 'pending' && current.status === 'pending') {
                        await this.proformaInvoiceService.updateStatus(
                            transactionCtx,
                            Number(proformaInvoice.id),
                            'issued',
                        );
                    }
                    // failed/canceled leave ProformaInvoice.status untouched so the payment stays retryable.
                    // A canceled attempt never completed, so there is nothing to reverse financially.
                },
            );
        } catch (err) {
            if (!isUniqueViolation(err)) throw err;
            // A concurrent call with the same (channel, externalReference) won; a final outcome may still resolve its pending row.
            if (paymentStatus !== 'pending') {
                const winner = await this.connection
                    .getRepository(ctx, PaymentAttempt)
                    .findOneOrFail({ where: { channel, providerPaymentId: externalReference } });
                await this.applyRepeatDelivery(ctx, proformaInvoice, winner, paymentStatus, fact);
            }
        }

        return (await this.proformaInvoiceService.findOne(ctx, Number(proformaInvoice.id)))!;
    }

    // A repeat for another document or a capture after a final failure is money a human must place.
    private async applyRepeatDelivery(
        ctx: RequestContext,
        proformaInvoice: ProformaInvoice,
        existing: PaymentAttempt,
        paymentStatus: PaymentStatus,
        fact?: PaymentFact,
    ): Promise<void> {
        const details = {
            proformaInvoiceId: Number(proformaInvoice.id),
            organizationId: proformaInvoice.organizationId,
            providerPaymentId: existing.providerPaymentId ?? undefined,
        };
        if (existing.proformaInvoiceId !== Number(proformaInvoice.id)) {
            await this.reconciliationIssueService.report(ctx, 'ORDER_MISMATCH', details);
            return;
        }
        const finalStatus = await this.resolvePendingAttempt(
            ctx,
            proformaInvoice,
            existing,
            paymentStatus,
            fact,
        );
        if (
            paymentStatus === 'captured' &&
            (finalStatus === 'failed' || finalStatus === 'canceled')
        ) {
            await this.reconciliationIssueService.report(ctx, 'INVALID_STATE_TRANSITION', details);
        }
    }

    // Same lock order as a new capture; the row re-read under lock makes concurrent deliveries apply once.
    private async resolvePendingAttempt(
        ctx: RequestContext,
        proformaInvoice: ProformaInvoice,
        existing: PaymentAttempt,
        paymentStatus: PaymentStatus,
        fact?: PaymentFact,
    ): Promise<PaymentStatus> {
        if (!shouldResolvePendingAttempt(existing.paymentStatus, paymentStatus)) {
            return existing.paymentStatus;
        }
        return withAggregateLock(
            this.connection,
            ctx,
            `proformaInvoices-for-order:${proformaInvoice.orderId}`,
            async transactionCtx => {
                const repo = this.connection.getRepository(transactionCtx, PaymentAttempt);
                const attempt = await repo.findOneOrFail({
                    where: { id: existing.id },
                    lock: { mode: 'pessimistic_write' },
                });
                if (!shouldResolvePendingAttempt(attempt.paymentStatus, paymentStatus)) {
                    return attempt.paymentStatus;
                }
                attempt.paymentStatus = paymentStatus;
                if (paymentStatus !== 'captured') {
                    await repo.save(attempt);
                    return paymentStatus;
                }
                attempt.amount = fact?.amount ?? attempt.amount;
                await this.settlementEntryService.allocate(
                    transactionCtx,
                    await repo.save(attempt),
                );
                return paymentStatus;
            },
        );
    }
}
