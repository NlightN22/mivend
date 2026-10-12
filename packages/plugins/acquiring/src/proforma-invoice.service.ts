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
import { documentNumberSearchTerm, withAggregateLock } from 'shared';
import { CounterpartyService, TradingPointService } from '@mivend/plugin-counterparty';
import { NumberingService } from '@mivend/plugin-numbering';

import { ProformaInvoice, ProformaInvoiceStatus } from './entities/proforma-invoice.entity';

interface OrganizationTotal {
    organizationId: number;
    amount: number;
}

export interface ProformaInvoiceListOptions {
    take?: number;
    skip?: number;
    status?: string;
    // Substring match against the proforma invoice's own number (see ProformaInvoice.number's doc comment).
    search?: string;
}

// Splits one aggregate storefront Order into one ProformaInvoice per organization it touches — decided
// direction in docs/payments.md "Organizations": the split must be known *before* an online
// payment is requested (a split-payment acquirer needs the full recipient/amount breakdown
// upfront), so this runs at checkout time, not from an async ERP callback. organizationId is read
// from OrderLine.customFields.organizationId, stamped by organizationOrderGuard.
@Injectable()
export class ProformaInvoiceService {
    constructor(
        private connection: TransactionalConnection,
        private entityHydrator: EntityHydrator,
        private counterpartyService: CounterpartyService,
        private tradingPointService: TradingPointService,
        private translator: TranslatorService,
        private numberingService: NumberingService,
    ) {}

    async computeSplit(ctx: RequestContext, order: Order): Promise<OrganizationTotal[]> {
        await this.entityHydrator.hydrate(ctx, order, { relations: ['lines.productVariant'] });

        const totalsByOrganization = new Map<number, number>();
        for (const line of order.lines) {
            const organizationId = line.customFields?.organizationId;
            if (organizationId == null) {
                throw new Error(
                    `OrderLine ${line.id} (variant ${line.productVariant.sku}) has no ` +
                        `organizationId set — cannot compute the proforma invoice split for this order`,
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
    // already-created proforma invoices instead of creating duplicates; the per-order lock makes two
    // concurrent calls (a double submit) agree on one set.
    async createProformaInvoicesForOrder(
        ctx: RequestContext,
        order: Order,
    ): Promise<ProformaInvoice[]> {
        return withAggregateLock(
            this.connection,
            ctx,
            `proformaInvoices-for-order:${order.id}`,
            txCtx => this.createUnderLock(txCtx, order),
        );
    }

    private async createUnderLock(ctx: RequestContext, order: Order): Promise<ProformaInvoice[]> {
        const repo = this.connection.getRepository(ctx, ProformaInvoice);
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
                `Customer ${order.customer.id} has no counterparty — cannot create proforma invoices`,
            );
        }

        // Denormalize the servicing branch onto each proforma invoice at creation time — see
        // docs/access-control.md's branch-scope axis. A missing preferred trading point is not
        // an error: the proforma invoice simply has no branch scope, same as Order's own field.
        const tradingPoint = await this.tradingPointService.getPreferredForCustomer(
            ctx,
            order.customer.id,
        );
        const branchId = tradingPoint
            ? await this.tradingPointService.resolveServicingBranchId(ctx, tradingPoint)
            : null;

        const split = await this.computeSplit(ctx, order);
        // All proforma invoices for this order are created together here, under the per-order lock
        // (createUnderLock is only reached once existing.length === 0 above), so the ordinal is
        // just the 1-based position within this split — no separate count query needed.
        const proformaInvoices = split.map(({ organizationId, amount }, index) =>
            repo.create({
                orderId: Number(order.id),
                organizationId,
                counterpartyId: Number(counterparty.id),
                amount,
                currencyCode: order.currencyCode,
                status: 'pending',
                branchId,
                number: this.numberingService.formatOrderDocumentNumber(order.code, index + 1),
            }),
        );
        return repo.save(proformaInvoices);
    }

    async findByOrderId(ctx: RequestContext, orderId: number): Promise<ProformaInvoice[]> {
        return this.connection.getRepository(ctx, ProformaInvoice).find({ where: { orderId } });
    }

    // Called by the payment-method handlers (apps/server/src/payment-method-handlers.ts) right
    // after a payment attempt resolves — there is no separate payment/ledger entity yet (see
    // docs/payments.md), so ProformaInvoice.status is, for now, the only place this project tracks
    // "did the money actually move" for an order's proforma invoices.
    async updateStatusForOrder(
        ctx: RequestContext,
        orderId: number,
        status: ProformaInvoiceStatus,
    ): Promise<void> {
        await this.connection.getRepository(ctx, ProformaInvoice).update({ orderId }, { status });
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
            qb.andWhere('proformaInvoice.status = :status', { status: options.status });
        }
        if (options?.search) {
            qb.andWhere('proformaInvoice.number ILIKE :search', {
                search: documentNumberSearchTerm(options.search),
            });
        }

        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    // Reused by ProformaInvoiceFieldResolver.lines (shop/admin API) and PdfGeneratorService.buildProformaInvoiceHtml
    // — the org-scoped line filter used to be duplicated in both places.
    async getLinesForProformaInvoice(
        ctx: RequestContext,
        proformaInvoice: ProformaInvoice,
    ): Promise<OrderLine[]> {
        const order = await this.connection
            .getRepository(ctx, Order)
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.lines', 'lines')
            .leftJoinAndSelect('lines.productVariant', 'variant')
            .leftJoinAndSelect('variant.translations', 'variantTranslations')
            .where('order.id = :id', { id: proformaInvoice.orderId })
            .getOne();
        if (!order) {
            throw new Error(
                `Order ${proformaInvoice.orderId} not found for proforma invoice ${proformaInvoice.id}`,
            );
        }
        const lines = order.lines.filter(
            line => line.customFields?.organizationId === proformaInvoice.organizationId,
        );
        for (const line of lines) {
            line.productVariant = this.translator.translate(line.productVariant, ctx);
        }
        return lines;
    }
}
