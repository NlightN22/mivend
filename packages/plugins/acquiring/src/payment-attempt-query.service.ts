import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { documentNumberSearchTerm } from 'shared';

import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { PaymentAttempt, PaymentStatus } from './entities/payment-attempt.entity';
import { SettlementEntry } from './entities/settlement-entry.entity';

// Must match the GraphQL PaymentListOptions field name exactly: args.options is passed through,
// and a mismatch silently drops the filter instead of erroring.
export interface PaymentListOptions {
    take?: number;
    skip?: number;
    status?: string;
    channel?: string;
    // Substring match against the payment's own internal number (see PaymentAttempt.number's
    // doc comment) — never providerPaymentId, the external reference, per the external-integration-rules skill.
    search?: string;
}

// One row of "what this payment was applied to" — a SettlementEntry that traces back to a
// given PaymentAttempt, joined with the proforma invoice it settled (or partially settled).
export interface PaymentAllocation {
    settlementEntry: SettlementEntry;
    proformaInvoice: ProformaInvoice | null;
}

@Injectable()
export class PaymentAttemptQueryService {
    constructor(private connection: TransactionalConnection) {}

    async findOne(ctx: RequestContext, id: number): Promise<PaymentAttempt | null> {
        return this.connection.getRepository(ctx, PaymentAttempt).findOne({ where: { id } });
    }

    // Badge-only: sums captured rows, without netting refunds or disputes; not for accounting decisions.
    // Batched into one query per page to avoid N+1 queries on order lists.
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
    // target proforma invoice (same join reasoning as findForCounterparty).
    async belongsToCounterparty(
        ctx: RequestContext,
        payment: PaymentAttempt,
        counterpartyId: ID,
    ): Promise<boolean> {
        if (!payment.proformaInvoiceId) return false;
        const proformaInvoice = await this.connection
            .getRepository(ctx, ProformaInvoice)
            .findOne({ where: { id: payment.proformaInvoiceId } });
        return proformaInvoice?.counterpartyId === Number(counterpartyId);
    }

    // PaymentAttempt has no counterpartyId; ProformaInvoice is the source of truth, so join through it.
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
            .innerJoin(
                ProformaInvoice,
                'proformaInvoice',
                'proformaInvoice.id = payment.proformaInvoiceId',
            )
            .where('proformaInvoice.counterpartyId = :counterpartyId', {
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
        if (options?.search) {
            qb.andWhere('payment.number ILIKE :search', {
                search: documentNumberSearchTerm(options.search),
            });
        }

        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    // One row per SettlementEntry: target proforma invoice first, then FIFO overflow, then advance last.
    async getAllocationsForPayment(
        ctx: RequestContext,
        paymentAttemptId: number,
    ): Promise<PaymentAllocation[]> {
        const entries = await this.connection
            .getRepository(ctx, SettlementEntry)
            .find({ where: { sourcePaymentId: paymentAttemptId }, order: { id: 'ASC' } });
        const allocations: PaymentAllocation[] = [];
        for (const entry of entries) {
            const proformaInvoice = entry.proformaInvoiceId
                ? await this.connection
                      .getRepository(ctx, ProformaInvoice)
                      .findOne({ where: { id: entry.proformaInvoiceId } })
                : null;
            allocations.push({ settlementEntry: entry, proformaInvoice });
        }
        return allocations;
    }
}
