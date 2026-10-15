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

// Must run inside a transaction: the pessimistic row lock below only works within one.
// Without it, concurrent calls can both read the same open proforma invoice and double-settle it.
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
                        counterpartyId: target.counterpartyId,
                        organizationId: target.organizationId,
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
                        counterpartyId: target.counterpartyId,
                        organizationId: target.organizationId,
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

    // Nothing yet draws advances down against new proforma invoices; this only reports the balance.
    //
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

    // Scan is bounded by FIFO_SCAN_LIMIT; any remainder past it becomes an advance, not a match.
    // Keeps the allocation loop from degrading as a counterparty's invoice history grows.
    private static readonly FIFO_SCAN_LIMIT = 200;

    private async getOpenProformaInvoicesFifo(
        ctx: RequestContext,
        counterpartyId: number,
        organizationId: number,
        currencyCode: string,
        preferredProformaInvoiceId: number,
    ): Promise<ProformaInvoice[]> {
        // pessimistic_write blocks concurrent allocate() calls from reading the same invoice as open.
        // Only takes effect inside a transaction.
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
