import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    EventBus,
    Order,
    RequestContext,
    TransactionalConnection,
    TranslatorService,
    UserInputError,
} from '@vendure/core';
import { withAggregateLock } from 'shared';
import { CounterpartyService, TradingPointService } from '@mivend/plugin-counterparty';
import { NumberingService } from '@mivend/plugin-numbering';

import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { ProformaInvoiceIssuedEvent } from './proforma-invoice-issued.event';
import {
    OrganizationContent,
    decideVersion,
    groupByOrganization,
} from './proforma-invoice-content';

export interface IssueOptions {
    // Status of a first version; a new version inherits the status of the one it replaces.
    initialStatus?: 'pending' | 'issued';
}

export interface IssueResult {
    current: ProformaInvoice[];
    created: ProformaInvoice[];
}

const UNPAID = ['pending', 'issued'];

// Issues and versions proforma invoices for an order: one current snapshot per organization,
// idempotent by content (docs/payments.md "Proforma invoice versions").
@Injectable()
export class ProformaInvoiceIssuingService {
    constructor(
        private connection: TransactionalConnection,
        private counterpartyService: CounterpartyService,
        private tradingPointService: TradingPointService,
        private translator: TranslatorService,
        private numberingService: NumberingService,
        private eventBus: EventBus,
    ) {}

    async issueForOrder(
        ctx: RequestContext,
        orderId: ID,
        options: IssueOptions = {},
    ): Promise<IssueResult> {
        return withAggregateLock(
            this.connection,
            ctx,
            `proformaInvoices-for-order:${orderId}`,
            txCtx => this.issueUnderLock(txCtx, orderId, options),
        );
    }

    // On-demand request for a placed, not cancelled order; any payment form and terms are allowed.
    async requestForOrder(ctx: RequestContext, orderId: ID): Promise<ProformaInvoice[]> {
        const order = await this.loadOrder(ctx, orderId);
        if (order.state === 'Cancelled') {
            throw new UserInputError('Proforma invoices cannot be requested for a cancelled order');
        }
        if (order.active) {
            throw new UserInputError('Proforma invoices can be requested only for a placed order');
        }
        const { current, created } = await this.issueForOrder(ctx, orderId, {
            initialStatus: 'issued',
        });
        for (const invoice of created) {
            await this.eventBus.publish(new ProformaInvoiceIssuedEvent(ctx, invoice));
        }
        return current;
    }

    // Current content of one organization minus the paid snapshot, null when nothing changed after payment.
    async differenceAfterPayment(
        ctx: RequestContext,
        invoice: ProformaInvoice,
    ): Promise<number | null> {
        if (invoice.status !== 'paid' || invoice.supersededById != null) return null;
        const order = await this.loadOrder(ctx, invoice.orderId);
        const content = this.contentFor(order).find(
            c => c.organizationId === invoice.organizationId,
        );
        if (!content) return -invoice.amount;
        if (decideVersion(invoice, content, order.currencyCode) === 'reuse') return null;
        const difference = content.amount - invoice.amount;
        return difference === 0 ? null : difference;
    }

    private async issueUnderLock(
        ctx: RequestContext,
        orderId: ID,
        options: IssueOptions,
    ): Promise<IssueResult> {
        const repo = this.connection.getRepository(ctx, ProformaInvoice);
        const order = await this.loadOrder(ctx, orderId);
        // Row lock: a concurrent payment allocation cannot flip a head to paid between this read and the supersede.
        const existing = await repo.find({
            where: { orderId: Number(orderId) },
            lock: { mode: 'pessimistic_write' },
        });
        const content = this.contentFor(order);
        const heads = new Map(
            existing
                .filter(i => i.supersededById == null && i.status !== 'superseded')
                .map(i => [i.organizationId, i] as const),
        );

        const created: ProformaInvoice[] = [];
        let ordinal = existing.length;
        let owner: { counterpartyId: number; branchId: string | null } | undefined;
        for (const group of content) {
            const head = heads.get(group.organizationId);
            if (decideVersion(head, group, order.currencyCode) !== 'create') continue;
            owner ??= await this.resolveOwner(ctx, order);
            ordinal += 1;
            const next = await repo.save(
                repo.create({
                    orderId: Number(order.id),
                    organizationId: group.organizationId,
                    counterpartyId: owner.counterpartyId,
                    branchId: owner.branchId,
                    amount: group.amount,
                    currencyCode: order.currencyCode,
                    lines: group.lines,
                    status:
                        head && UNPAID.includes(head.status)
                            ? head.status
                            : (options.initialStatus ?? 'pending'),
                    version: head ? head.version + 1 : 1,
                    supersedesId: head ? Number(head.id) : null,
                    number: this.numberingService.formatOrderDocumentNumber(order.code, ordinal),
                }),
            );
            if (head && UNPAID.includes(head.status)) {
                await repo.update(
                    { id: head.id },
                    { status: 'superseded', supersededById: Number(next.id) },
                );
            }
            created.push(next);
        }

        const organizations = new Set(content.map(c => c.organizationId));
        for (const head of heads.values()) {
            if (!organizations.has(head.organizationId) && UNPAID.includes(head.status)) {
                await repo.update({ id: head.id }, { status: 'cancelled' });
            }
        }

        const current = await repo.find({
            where: { orderId: Number(orderId) },
            order: { number: 'ASC' },
        });
        return {
            current: current.filter(i => i.status !== 'superseded'),
            created,
        };
    }

    private contentFor(order: Order): OrganizationContent[] {
        return groupByOrganization(order.lines);
    }

    private async resolveOwner(
        ctx: RequestContext,
        order: Order,
    ): Promise<{ counterpartyId: number; branchId: string | null }> {
        if (!order.customer) {
            throw new Error(`Order ${order.id} has no customer — cannot resolve a counterparty`);
        }
        const counterparty = await this.counterpartyService.getForCustomer(ctx, order.customer.id);
        if (!counterparty) {
            throw new Error(
                `Customer ${order.customer.id} has no counterparty — cannot create proforma invoices`,
            );
        }
        const tradingPoint = await this.tradingPointService.getPreferredForCustomer(
            ctx,
            order.customer.id,
        );
        const branchId = tradingPoint
            ? await this.tradingPointService.resolveServicingBranchId(ctx, tradingPoint)
            : null;
        return { counterpartyId: Number(counterparty.id), branchId };
    }

    private async loadOrder(ctx: RequestContext, orderId: ID): Promise<Order> {
        const order = await this.connection.getRepository(ctx, Order).findOne({
            where: { id: orderId },
            relations: {
                customer: true,
                lines: { productVariant: { translations: true } },
            },
        });
        if (!order) throw new Error(`Order ${orderId} not found`);
        for (const line of order.lines) {
            line.productVariant = this.translator.translate(line.productVariant, ctx);
        }
        return order;
    }
}
