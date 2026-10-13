import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { documentNumberSearchTerm } from 'shared';

import { applyStatusFilter } from './proforma-invoice-display';
import { ProformaInvoice, ProformaInvoiceStatus } from './entities/proforma-invoice.entity';

export interface ProformaInvoiceListOptions {
    take?: number;
    skip?: number;
    status?: string;
    // Substring match against the proforma invoice's own number (see ProformaInvoice.number's doc comment).
    search?: string;
    // Shop API: only the proforma invoices of one own order.
    orderCode?: string;
}

@Injectable()
export class ProformaInvoiceService {
    constructor(private connection: TransactionalConnection) {}

    async findByOrderId(ctx: RequestContext, orderId: number): Promise<ProformaInvoice[]> {
        return this.connection.getRepository(ctx, ProformaInvoice).find({ where: { orderId } });
    }

    // Checkout-time, whole-order path: only moves unpaid `pending` snapshots, never a paid or superseded one.
    async updateStatusForOrder(
        ctx: RequestContext,
        orderId: number,
        status: ProformaInvoiceStatus,
    ): Promise<void> {
        await this.connection
            .getRepository(ctx, ProformaInvoice)
            .update({ orderId, status: 'pending' }, { status });
    }

    // Used by PaymentAttemptService.payProformaInvoice — paying a single proforma invoice must never touch the
    // status of any *other* proforma invoice for the same order (unlike updateStatusForOrder, which is
    // for the checkout-time, whole-order payment path).
    async updateStatus(
        ctx: RequestContext,
        proformaInvoiceId: number,
        status: ProformaInvoiceStatus,
    ): Promise<void> {
        await this.connection
            .getRepository(ctx, ProformaInvoice)
            .update({ id: proformaInvoiceId }, { status });
    }

    async findOne(ctx: RequestContext, proformaInvoiceId: number): Promise<ProformaInvoice | null> {
        return this.connection
            .getRepository(ctx, ProformaInvoice)
            .findOne({ where: { id: proformaInvoiceId } });
    }

    async findByUuid(ctx: RequestContext, uuid: string): Promise<ProformaInvoice | null> {
        return this.connection.getRepository(ctx, ProformaInvoice).findOne({ where: { uuid } });
    }

    async findForCounterparty(
        ctx: RequestContext,
        counterpartyId: ID,
        options?: ProformaInvoiceListOptions,
    ): Promise<PaginatedList<ProformaInvoice>> {
        const take = options?.take ?? 50;
        const skip = options?.skip ?? 0;

        const qb = this.connection
            .getRepository(ctx, ProformaInvoice)
            .createQueryBuilder('proformaInvoice')
            .where('proformaInvoice.counterpartyId = :counterpartyId', {
                counterpartyId: Number(counterpartyId),
            })
            .orderBy('proformaInvoice.createdAt', 'DESC')
            // Tiebreaker: multiple proforma invoices from the same order split are created in the same
            // transaction and can share an identical createdAt timestamp — without a secondary
            // sort key, their relative order across two separate queries is undefined (real
            // flakiness observed in e2e: refetching "the same" list after paying one proforma invoice
            // returned them in a different order).
            .addOrderBy('proformaInvoice.id', 'DESC')
            .take(take)
            .skip(skip);

        if (options?.status) {
            applyStatusFilter(qb, 'proformaInvoice', options.status);
        }
        if (options?.search) {
            qb.andWhere('proformaInvoice.number ILIKE :search', {
                search: documentNumberSearchTerm(options.search),
            });
        }

        if (options?.orderCode) {
            qb.andWhere(
                'proformaInvoice.orderId IN (SELECT o.id FROM "order" o WHERE o.code = :orderCode)',
                {
                    orderCode: options.orderCode,
                },
            );
        }

        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }
}
