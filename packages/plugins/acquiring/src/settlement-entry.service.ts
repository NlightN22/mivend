import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { Invoice } from './entities/invoice.entity';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { SettlementEntry } from './entities/settlement-entry.entity';
import { InvoiceService } from './invoice.service';

export interface MoneyAmount {
    amount: number;
    currencyCode: string;
}

// Cash application (docs/payments.md "Cash application and payment allocation"): a captured
// payment settles its own target invoice first, then FIFOs any remainder across the same
// counterparty+organization's other open invoices (oldest first), and whatever still can't be
// allocated becomes an advance — a credit on the counterparty, never forced onto any invoice.
// This is what makes an accidental/duplicate payment (e.g. paid online *and* a bank transfer for
// the same invoice lands from the ERP) a non-event: the second capture simply finds no
// remaining balance on that invoice and flows through to the next open one, or to the advance.
//
// Must run inside a transaction (see PaymentAttemptService.payInvoice, which wraps the
// PaymentAttempt insert + this whole call in one `connection.withTransaction`) — the pessimistic
// row lock taken in getOpenInvoicesFifo below only has an effect inside a transaction, and
// without one, two concurrent allocate() calls for the same counterparty+organization could both
// read the same "open" invoice before either commits, double-settling it (a lost-update race).
@Injectable()
export class SettlementEntryService {
    constructor(
        private connection: TransactionalConnection,
        private invoiceService: InvoiceService,
    ) {}

    async allocate(
        ctx: RequestContext,
        paymentAttempt: PaymentAttempt,
    ): Promise<SettlementEntry[]> {
        if (!paymentAttempt.invoiceId) {
            throw new Error(
                `PaymentAttempt ${paymentAttempt.id} has no invoiceId — cannot resolve which ` +
                    'counterparty/organization to allocate against (lump payments with no ' +
                    'invoice reference are not wired yet, see docs/payments.md)',
            );
        }
        const targetInvoice = await this.invoiceService.findOne(ctx, paymentAttempt.invoiceId);
        if (!targetInvoice) {
            throw new Error(`Invoice ${paymentAttempt.invoiceId} not found for allocation`);
        }
        if (targetInvoice.currencyCode !== paymentAttempt.currencyCode) {
            // Never silently cross-allocate currencies — docs/payments.md flags multi-currency
            // settlement as a genuinely open design question, so refuse rather than guess.
            throw new Error(
                `Currency mismatch: PaymentAttempt ${paymentAttempt.id} is ` +
                    `${paymentAttempt.currencyCode}, target Invoice ${targetInvoice.id} is ` +
                    `${targetInvoice.currencyCode}`,
            );
        }

        const openInvoices = await this.getOpenInvoicesFifo(
            ctx,
            targetInvoice.counterpartyId,
            targetInvoice.organizationId,
            targetInvoice.currencyCode,
            Number(targetInvoice.id),
        );

        const repo = this.connection.getRepository(ctx, SettlementEntry);
        const entries: SettlementEntry[] = [];
        let remaining = paymentAttempt.amount;

        for (const invoice of openInvoices) {
            if (remaining <= 0) break;
            const owed = invoice.amount;
            const allocated = Math.min(remaining, owed);
            entries.push(
                await repo.save(
                    repo.create({
                        counterpartyId: targetInvoice.counterpartyId,
                        organizationId: targetInvoice.organizationId,
                        invoiceId: Number(invoice.id),
                        sourceType: 'payment.captured',
                        sourcePaymentId: Number(paymentAttempt.id),
                        amount: allocated,
                        currencyCode: paymentAttempt.currencyCode,
                        allocatedOrderId: invoice.orderId,
                        allocationAmount: allocated,
                    }),
                ),
            );
            if (allocated >= owed) {
                await this.invoiceService.updateStatus(ctx, Number(invoice.id), 'paid');
            }
            remaining -= allocated;
        }

        if (remaining > 0) {
            // Advance: a credit on the counterparty, not tied to any invoice/order.
            entries.push(
                await repo.save(
                    repo.create({
                        counterpartyId: targetInvoice.counterpartyId,
                        organizationId: targetInvoice.organizationId,
                        invoiceId: null,
                        sourceType: 'payment.captured',
                        sourcePaymentId: Number(paymentAttempt.id),
                        amount: remaining,
                        currencyCode: paymentAttempt.currencyCode,
                        allocatedOrderId: null,
                        allocationAmount: null,
                    }),
                ),
            );
        }

        return entries;
    }

    // Running total of unallocated advance credit for a counterparty, grouped by currency. Note:
    // nothing yet automatically draws an existing advance down against a newly created invoice
    // (that consumption step is not implemented — see docs/payments.md's cash-application
    // section; this method only reports the advance that has accumulated so far).
    async getAdvanceBalance(ctx: RequestContext, counterpartyId: number): Promise<MoneyAmount[]> {
        const rows = await this.connection
            .getRepository(ctx, SettlementEntry)
            .createQueryBuilder('entry')
            .select('entry.currencyCode', 'currencyCode')
            .addSelect('SUM(entry.amount)', 'amount')
            .where('entry.counterpartyId = :counterpartyId', { counterpartyId })
            .andWhere('entry.invoiceId IS NULL')
            .groupBy('entry.currencyCode')
            .getRawMany<{ currencyCode: string; amount: string }>();
        return rows.map(row => ({ currencyCode: row.currencyCode, amount: Number(row.amount) }));
    }

    // Bounded, not "fetch every open invoice this counterparty+organization has ever
    // accumulated" — a real payment amount only ever needs to walk a handful of open
    // obligations before it's exhausted. FIFO_SCAN_LIMIT open invoices is far more than any
    // realistic payment will need to cover; if a payment's amount is somehow large enough to
    // reach past it, the remainder is recorded as an advance instead of matching an older
    // obligation — money is never lost, just parked as credit that can be manually
    // re-associated later (docs/payments.md "Cash application" already allows for that), rather
    // than the whole allocation loop degrading as the counterparty's invoice history grows
    // without bound.
    private static readonly FIFO_SCAN_LIMIT = 200;

    private async getOpenInvoicesFifo(
        ctx: RequestContext,
        counterpartyId: number,
        organizationId: number,
        currencyCode: string,
        preferredInvoiceId: number,
    ): Promise<Invoice[]> {
        // Row-locked (pessimistic_write) so two concurrent allocate() calls for the same
        // counterparty+organization can't both read the same invoice as "open" before either
        // commits — the second call blocks until the first's transaction finishes, then sees
        // the now-updated status. Only has an effect inside a transaction (see class doc above).
        const open = await this.connection
            .getRepository(ctx, Invoice)
            .createQueryBuilder('invoice')
            .where('invoice.counterpartyId = :counterpartyId', { counterpartyId })
            .andWhere('invoice.organizationId = :organizationId', { organizationId })
            .andWhere('invoice.currencyCode = :currencyCode', { currencyCode })
            .andWhere('invoice.status IN (:...statuses)', { statuses: ['pending', 'issued'] })
            .orderBy('invoice.createdAt', 'ASC')
            .take(SettlementEntryService.FIFO_SCAN_LIMIT)
            .setLock('pessimistic_write')
            .getMany();

        const preferredIndex = open.findIndex(invoice => Number(invoice.id) === preferredInvoiceId);
        if (preferredIndex < 0 && open.length >= SettlementEntryService.FIFO_SCAN_LIMIT) {
            // The target invoice itself wasn't among the oldest FIFO_SCAN_LIMIT open invoices —
            // fetch it directly so it's still settled first per "Cash application"'s own rule,
            // even though it won't be found by the bounded scan above.
            const preferred = await this.connection
                .getRepository(ctx, Invoice)
                .createQueryBuilder('invoice')
                .where('invoice.id = :id', { id: preferredInvoiceId })
                .andWhere('invoice.counterpartyId = :counterpartyId', { counterpartyId })
                .andWhere('invoice.organizationId = :organizationId', { organizationId })
                .setLock('pessimistic_write')
                .getOne();
            if (preferred && (preferred.status === 'pending' || preferred.status === 'issued')) {
                open.unshift(preferred);
            }
        } else if (preferredIndex > 0) {
            const [preferred] = open.splice(preferredIndex, 1);
            open.unshift(preferred);
        }
        return open;
    }
}
