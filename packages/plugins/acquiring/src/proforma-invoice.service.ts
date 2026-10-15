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

    // Paying one proforma invoice must never change the status of sibling proformas of the same order.
    // Unlike updateStatusForOrder, which is only for whole-order payment at checkout.
    async updateStatus(
        ctx: RequestContext,
        proformaInvoiceId: number,
        status: ProformaInvoiceStatus,
        fromStatus?: ProformaInvoiceStatus,
    ): Promise<void> {
        await this.connection
            .getRepository(ctx, ProformaInvoice)
            .update(
                { id: proformaInvoiceId, ...(fromStatus ? { status: fromStatus } : {}) },
                { status },
            );
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
            // Proformas split from one order share createdAt when created in one transaction;
            // without a secondary sort key their order across separate queries is undefined.
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
