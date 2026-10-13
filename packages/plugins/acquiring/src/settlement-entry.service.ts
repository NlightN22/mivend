import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { SettlementEntry } from './entities/settlement-entry.entity';
import { ProformaInvoiceService } from './proforma-invoice.service';

export interface MoneyAmount {
    amount: number;
    currencyCode: string;
}

// Cash application (docs/payments.md "Cash application and payment allocation"): a captured
// payment settles its own target proforma invoice first, then FIFOs any remainder across the same
// counterparty+organization's other open proforma invoices (oldest first), and whatever still can't be
// allocated becomes an advance — a credit on the counterparty, never forced onto any proforma invoice.
// This is what makes an accidental/duplicate payment (e.g. paid online *and* a bank transfer for
// the same proforma invoice lands from the ERP) a non-event: the second capture simply finds no
// remaining balance on that proforma invoice and flows through to the next open one, or to the advance.
//
// Must run inside a transaction (see PaymentAttemptService.payProformaInvoice, which wraps the
// PaymentAttempt insert + this whole call in one `connection.withTransaction`) — the pessimistic
// row lock taken in getOpenProformaInvoicesFifo below only has an effect inside a transaction, and
// without one, two concurrent allocate() calls for the same counterparty+organization could both
// read the same "open" proforma invoice before either commits, double-settling it (a lost-update race).
@Injectable()
export class SettlementEntryService {
    constructor(
        private connection: TransactionalConnection,
        private proformaInvoiceService: ProformaInvoiceService,
    ) {}

    async allocate(
        ctx: RequestContext,
        paymentAttempt: PaymentAttempt,
    ): Promise<SettlementEntry[]> {
        if (!paymentAttempt.proformaInvoiceId) {
            throw new Error(
                `PaymentAttempt ${paymentAttempt.id} has no proformaInvoiceId — cannot resolve which ` +
                    'counterparty/organization to allocate against',
            );
        }
        const document = await this.proformaInvoiceService.findOne(
            ctx,
            paymentAttempt.proformaInvoiceId,
        );
        if (!document) {
            throw new Error(
                `ProformaInvoice ${paymentAttempt.proformaInvoiceId} not found for allocation`,
            );
        }
        if (document.currencyCode !== paymentAttempt.currencyCode) {
            throw new Error(
                `Currency mismatch: PaymentAttempt ${paymentAttempt.id} is ` +
                    `${paymentAttempt.currencyCode}, target ProformaInvoice ${document.id} is ` +
                    `${document.currencyCode}`,
            );
        }
        const target = {
            counterpartyId: document.counterpartyId,
            organizationId: document.organizationId,
            preferredId: Number(document.id),
        };
        const targetProformaInvoice = target;

        const openProformaInvoices = await this.getOpenProformaInvoicesFifo(
            ctx,
            target.counterpartyId,
            target.organizationId,
            paymentAttempt.currencyCode,
            target.preferredId,
        );
        const alreadyPaid = await this.paidSoFar(ctx, openProformaInvoices);

        const repo = this.connection.getRepository(ctx, SettlementEntry);
        const entries: SettlementEntry[] = [];
        let remaining = paymentAttempt.amount;

        for (const proformaInvoice of openProformaInvoices) {
            if (remaining <= 0) break;
            const owed =
                proformaInvoice.amount - (alreadyPaid.get(Number(proformaInvoice.id)) ?? 0);
            if (owed <= 0) continue;
            const allocated = Math.min(remaining, owed);
            entries.push(
                await repo.save(
                    repo.create({
                        counterpartyId: targetProformaInvoice.counterpartyId,
                        organizationId: targetProformaInvoice.organizationId,
                        proformaInvoiceId: Number(proformaInvoice.id),
                        sourceType: 'payment.captured',
                        sourcePaymentId: Number(paymentAttempt.id),
                        amount: allocated,
                        currencyCode: paymentAttempt.currencyCode,
                        allocatedOrderId: proformaInvoice.orderId,
                        allocationAmount: allocated,
                    }),
                ),
            );
            if (allocated >= owed) {
                await this.proformaInvoiceService.updateStatus(
                    ctx,
                    Number(proformaInvoice.id),
                    'paid',
                );
            }
            remaining -= allocated;
        }

        if (remaining > 0) {
            // Advance: a credit on the counterparty, not tied to any proforma invoice/order.
            entries.push(
                await repo.save(
                    repo.create({
                        counterpartyId: targetProformaInvoice.counterpartyId,
                        organizationId: targetProformaInvoice.organizationId,
                        proformaInvoiceId: null,
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

    // Earlier partial payments: a document stays open until the allocations cover its amount.
    private async paidSoFar(
        ctx: RequestContext,
        documents: ProformaInvoice[],
    ): Promise<Map<number, number>> {
        if (documents.length === 0) return new Map();
        const rows = await this.connection
            .getRepository(ctx, SettlementEntry)
            .createQueryBuilder('entry')
            .select('entry.proformaInvoiceId', 'id')
            .addSelect('SUM(entry.allocationAmount)', 'paid')
            .where('entry.proformaInvoiceId IN (:...ids)', {
                ids: documents.map(d => Number(d.id)),
            })
            .andWhere('entry.sourceType = :sourceType', { sourceType: 'payment.captured' })
            .groupBy('entry.proformaInvoiceId')
            .getRawMany<{ id: number; paid: string }>();
        return new Map(rows.map(r => [Number(r.id), Number(r.paid)]));
    }

    // Running total of unallocated advance credit for a counterparty, grouped by currency. Note:
    // nothing yet automatically draws an existing advance down against a newly created proforma invoice
    // (that consumption step is not implemented — see docs/payments.md's cash-application
    // section; this method only reports the advance that has accumulated so far).
    async getAdvanceBalance(ctx: RequestContext, counterpartyId: number): Promise<MoneyAmount[]> {
        const rows = await this.connection
            .getRepository(ctx, SettlementEntry)
            .createQueryBuilder('entry')
            .select('entry.currencyCode', 'currencyCode')
            .addSelect('SUM(entry.amount)', 'amount')
            .where('entry.counterpartyId = :counterpartyId', { counterpartyId })
            .andWhere('entry.proformaInvoiceId IS NULL')
            .groupBy('entry.currencyCode')
            .getRawMany<{ currencyCode: string; amount: string }>();
        return rows.map(row => ({ currencyCode: row.currencyCode, amount: Number(row.amount) }));
    }

    // Bounded, not "fetch every open proforma invoice this counterparty+organization has ever
    // accumulated" — a real payment amount only ever needs to walk a handful of open
    // obligations before it's exhausted. FIFO_SCAN_LIMIT open proforma invoices is far more than any
    // realistic payment will need to cover; if a payment's amount is somehow large enough to
    // reach past it, the remainder is recorded as an advance instead of matching an older
    // obligation — money is never lost, just parked as credit that can be manually
    // re-associated later (docs/payments.md "Cash application" already allows for that), rather
    // than the whole allocation loop degrading as the counterparty's proforma invoice history grows
    // without bound.
    private static readonly FIFO_SCAN_LIMIT = 200;

    private async getOpenProformaInvoicesFifo(
        ctx: RequestContext,
        counterpartyId: number,
        organizationId: number,
        currencyCode: string,
        preferredProformaInvoiceId: number,
    ): Promise<ProformaInvoice[]> {
        // Row-locked (pessimistic_write) so two concurrent allocate() calls for the same
        // counterparty+organization can't both read the same proforma invoice as "open" before either
        // commits — the second call blocks until the first's transaction finishes, then sees
        // the now-updated status. Only has an effect inside a transaction (see class doc above).
        const open = await this.connection
            .getRepository(ctx, ProformaInvoice)
            .createQueryBuilder('proformaInvoice')
            .where('proformaInvoice.counterpartyId = :counterpartyId', { counterpartyId })
            .andWhere('proformaInvoice.organizationId = :organizationId', { organizationId })
            .andWhere('proformaInvoice.currencyCode = :currencyCode', { currencyCode })
            .andWhere('proformaInvoice.status IN (:...statuses)', {
                statuses: ['pending', 'issued'],
            })
            .orderBy('proformaInvoice.createdAt', 'ASC')
            .take(SettlementEntryService.FIFO_SCAN_LIMIT)
            .setLock('pessimistic_write')
            .getMany();

        const preferredIndex = open.findIndex(
            proformaInvoice => Number(proformaInvoice.id) === preferredProformaInvoiceId,
        );
        if (preferredIndex < 0) {
            // Not in the open set: beyond the scan limit, or paid/superseded/cancelled. A superseded
            // version hands its payment to the current version of its chain (re-read under the lock).
            const repo = this.connection.getRepository(ctx, ProformaInvoice);
            const load = (id: number): Promise<ProformaInvoice | null> =>
                repo
                    .createQueryBuilder('proformaInvoice')
                    .where('proformaInvoice.id = :id', { id })
                    .andWhere('proformaInvoice.counterpartyId = :counterpartyId', {
                        counterpartyId,
                    })
                    .andWhere('proformaInvoice.organizationId = :organizationId', {
                        organizationId,
                    })
                    .setLock('pessimistic_write')
                    .getOne();
            let preferred = await load(preferredProformaInvoiceId);
            for (let hops = 0; preferred?.status === 'superseded' && hops < 20; hops++) {
                if (!preferred.supersededById) break;
                const next = await load(preferred.supersededById);
                if (!next) break;
                preferred = next;
            }
            if (preferred && (preferred.status === 'pending' || preferred.status === 'issued')) {
                const at = open.findIndex(p => Number(p.id) === Number(preferred!.id));
                if (at >= 0) open.splice(at, 1);
                open.unshift(preferred);
            }
        } else if (preferredIndex > 0) {
            const [preferred] = open.splice(preferredIndex, 1);
            open.unshift(preferred);
        }
        return open;
    }
}
