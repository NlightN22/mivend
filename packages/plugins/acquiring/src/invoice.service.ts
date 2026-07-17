import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    EntityHydrator,
    Order,
    OrderLine,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
    TranslatorService,
} from '@vendure/core';
import { CounterpartyService, TradingPointService } from '@mivend/plugin-counterparty';

import { Invoice, InvoiceStatus } from './entities/invoice.entity';

interface OrganizationTotal {
    organizationId: number;
    amount: number;
}

export interface InvoiceListOptions {
    take?: number;
    skip?: number;
    status?: string;
}

// Splits one aggregate storefront Order into one Invoice per organization it touches — decided
// direction in docs/payments.md "Organizations": the split must be known *before* an online
// payment is requested (a split-payment acquirer needs the full recipient/amount breakdown
// upfront), so this runs at checkout time, not from an async ERP callback. organizationId comes
// from ProductVariant.customFields.organizationId (ERP-imported catalog master data, mirroring
// PriceEntry) — not yet backed by a real 1C export, see docs/payments.md.
@Injectable()
export class InvoiceService {
    constructor(
        private connection: TransactionalConnection,
        private entityHydrator: EntityHydrator,
        private counterpartyService: CounterpartyService,
        private tradingPointService: TradingPointService,
        private translator: TranslatorService,
    ) {}

    async computeSplit(ctx: RequestContext, order: Order): Promise<OrganizationTotal[]> {
        await this.entityHydrator.hydrate(ctx, order, { relations: ['lines.productVariant'] });

        const totalsByOrganization = new Map<number, number>();
        for (const line of order.lines) {
            const organizationId = line.productVariant.customFields?.organizationId;
            if (organizationId == null) {
                throw new Error(
                    `OrderLine ${line.id} (variant ${line.productVariant.sku}) has no ` +
                        `organizationId set — cannot compute the invoice split for this order`,
                );
            }
            const current = totalsByOrganization.get(organizationId) ?? 0;
            totalsByOrganization.set(organizationId, current + line.linePriceWithTax);
        }

        return [...totalsByOrganization.entries()].map(([organizationId, amount]) => ({
            organizationId,
            amount,
        }));
    }

    // Idempotent: a retry (e.g. the customer reloads the payment page) returns the
    // already-created invoices instead of creating duplicates.
    async createInvoicesForOrder(ctx: RequestContext, order: Order): Promise<Invoice[]> {
        const repo = this.connection.getRepository(ctx, Invoice);
        const existing = await repo.find({ where: { orderId: Number(order.id) } });
        if (existing.length > 0) {
            return existing;
        }

        await this.entityHydrator.hydrate(ctx, order, { relations: ['customer'] });
        if (!order.customer) {
            throw new Error(`Order ${order.id} has no customer — cannot resolve a counterparty`);
        }
        const counterparty = await this.counterpartyService.getForCustomer(ctx, order.customer.id);
        if (!counterparty) {
            throw new Error(
                `Customer ${order.customer.id} has no counterparty — cannot create invoices`,
            );
        }

        // Denormalize the servicing branch onto each invoice at creation time — see
        // docs/access-control.md's branch-scope axis. A missing preferred trading point is not
        // an error: the invoice simply has no branch scope, same as Order's own field.
        const tradingPoint = await this.tradingPointService.getPreferredForCustomer(
            ctx,
            order.customer.id,
        );
        const branchId = tradingPoint?.servicingBranchId ?? null;

        const split = await this.computeSplit(ctx, order);
        const invoices = split.map(({ organizationId, amount }) =>
            repo.create({
                orderId: Number(order.id),
                organizationId,
                counterpartyId: Number(counterparty.id),
                amount,
                currencyCode: order.currencyCode,
                status: 'pending',
                branchId,
            }),
        );
        return repo.save(invoices);
    }

    async findByOrderId(ctx: RequestContext, orderId: number): Promise<Invoice[]> {
        return this.connection.getRepository(ctx, Invoice).find({ where: { orderId } });
    }

    // Called by the payment-method handlers (apps/server/src/payment-method-handlers.ts) right
    // after a payment attempt resolves — there is no separate payment/ledger entity yet (see
    // docs/payments.md), so Invoice.status is, for now, the only place this project tracks
    // "did the money actually move" for an order's invoices.
    async updateStatusForOrder(
        ctx: RequestContext,
        orderId: number,
        status: InvoiceStatus,
    ): Promise<void> {
        await this.connection.getRepository(ctx, Invoice).update({ orderId }, { status });
    }

    // Used by PaymentAttemptService.payInvoice — paying a single invoice must never touch the
    // status of any *other* invoice for the same order (unlike updateStatusForOrder, which is
    // for the checkout-time, whole-order payment path).
    async updateStatus(
        ctx: RequestContext,
        invoiceId: number,
        status: InvoiceStatus,
    ): Promise<void> {
        await this.connection.getRepository(ctx, Invoice).update({ id: invoiceId }, { status });
    }

    async findOne(ctx: RequestContext, invoiceId: number): Promise<Invoice | null> {
        return this.connection.getRepository(ctx, Invoice).findOne({ where: { id: invoiceId } });
    }

    async findForCounterparty(
        ctx: RequestContext,
        counterpartyId: ID,
        options?: InvoiceListOptions,
    ): Promise<PaginatedList<Invoice>> {
        const take = options?.take ?? 50;
        const skip = options?.skip ?? 0;

        const qb = this.connection
            .getRepository(ctx, Invoice)
            .createQueryBuilder('invoice')
            .where('invoice.counterpartyId = :counterpartyId', {
                counterpartyId: Number(counterpartyId),
            })
            .orderBy('invoice.createdAt', 'DESC')
            // Tiebreaker: multiple invoices from the same order split are created in the same
            // transaction and can share an identical createdAt timestamp — without a secondary
            // sort key, their relative order across two separate queries is undefined (real
            // flakiness observed in e2e: refetching "the same" list after paying one invoice
            // returned them in a different order).
            .addOrderBy('invoice.id', 'DESC')
            .take(take)
            .skip(skip);

        if (options?.status) {
            qb.andWhere('invoice.status = :status', { status: options.status });
        }

        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    // Reused by InvoiceFieldResolver.lines (shop/admin API) and PdfGeneratorService.buildInvoiceHtml
    // — the org-scoped line filter used to be duplicated in both places.
    async getLinesForInvoice(ctx: RequestContext, invoice: Invoice): Promise<OrderLine[]> {
        const order = await this.connection
            .getRepository(ctx, Order)
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.lines', 'lines')
            .leftJoinAndSelect('lines.productVariant', 'variant')
            .leftJoinAndSelect('variant.translations', 'variantTranslations')
            .where('order.id = :id', { id: invoice.orderId })
            .getOne();
        if (!order) {
            throw new Error(`Order ${invoice.orderId} not found for invoice ${invoice.id}`);
        }
        const lines = order.lines.filter(
            line => line.productVariant.customFields?.organizationId === invoice.organizationId,
        );
        for (const line of lines) {
            line.productVariant = this.translator.translate(line.productVariant, ctx);
        }
        return lines;
    }
}
