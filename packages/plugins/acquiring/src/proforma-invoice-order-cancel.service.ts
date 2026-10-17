import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';
import { In } from 'typeorm';

import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { SettlementEntry } from './entities/settlement-entry.entity';

// An order cancel is never refused over payments (docs/payments.md "Order cancel and payments").
@Injectable()
export class ProformaInvoiceOrderCancelService {
    constructor(private connection: TransactionalConnection) {}

    async closeForCancelledOrder(ctx: RequestContext, orderId: number): Promise<void> {
        await withAggregateLock(
            this.connection,
            ctx,
            `proformaInvoices-for-order:${orderId}`,
            async txCtx => {
                const invoices = await this.connection
                    .getRepository(txCtx, ProformaInvoice)
                    .createQueryBuilder('proformaInvoice')
                    .where('proformaInvoice.orderId = :orderId', { orderId })
                    .orderBy('proformaInvoice.createdAt', 'ASC')
                    .addOrderBy('proformaInvoice.id', 'ASC')
                    .setLock('pessimistic_write')
                    .getMany();
                const closable = invoices.filter(
                    i =>
                        ['pending', 'issued', 'paid'].includes(i.status) &&
                        i.supersededById == null,
                );
                if (closable.length > 0) {
                    await this.connection
                        .getRepository(txCtx, ProformaInvoice)
                        .update(
                            { id: In(closable.map(i => i.id)) },
                            { status: 'cancelled', withdrawnAt: new Date() },
                        );
                }
                for (const invoice of invoices) {
                    await this.releaseToAdvance(txCtx, invoice);
                }
            },
        );
    }

    // Append-only: a pair of rows moves the document's net allocation onto the advance, so a repeat finds zero.
    private async releaseToAdvance(ctx: RequestContext, invoice: ProformaInvoice): Promise<void> {
        const repo = this.connection.getRepository(ctx, SettlementEntry);
        const row = await repo
            .createQueryBuilder('entry')
            .select('COALESCE(SUM(entry.amount), 0)', 'total')
            .where('entry.proformaInvoiceId = :id', { id: invoice.id })
            .getRawOne<{ total: string }>();
        const net = Number(row?.total ?? 0);
        if (net <= 0) return;
        const common = {
            counterpartyId: invoice.counterpartyId,
            organizationId: invoice.organizationId,
            sourceType: 'order.cancelled' as const,
            sourcePaymentId: null,
            currencyCode: invoice.currencyCode,
        };
        await repo.save([
            repo.create({
                ...common,
                proformaInvoiceId: Number(invoice.id),
                amount: -net,
                allocatedOrderId: invoice.orderId,
                allocationAmount: -net,
            }),
            repo.create({
                ...common,
                proformaInvoiceId: null,
                amount: net,
                allocatedOrderId: null,
                allocationAmount: null,
            }),
        ]);
    }
}
