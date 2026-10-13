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
import { DEFAULT_PROFORMA_PAYMENT_TERM_DAYS, withAggregateLock } from 'shared';
import { BranchSettingsService } from '@mivend/plugin-access-control';
import { CounterpartyService, TradingPointService } from '@mivend/plugin-counterparty';
import { NumberingService } from '@mivend/plugin-numbering';

import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { addDays, parseProformaNumber } from './proforma-invoice-number';
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

const PRE_PLACED_STATES = ['Created', 'AddingItems', 'ArrangingPayment', 'Draft'];
const UNPAID = ['pending', 'issued'];

// A new organization takes the next ordinal after the highest one used, not the row count.
function ordinalOf(row: ProformaInvoice): number {
    return parseProformaNumber(row.number)?.ordinal ?? 0;
}

function maxOrdinal(rows: ProformaInvoice[]): number {
    return rows.reduce((max, r) => Math.max(max, ordinalOf(r)), 0);
}

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
        private branchSettingsService: BranchSettingsService,
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
        if (order.customFields.isExternal) {
            throw new UserInputError('Proforma invoices are not issued for orders from the ERP');
        }
        if (order.state === 'Cancelled') {
            throw new UserInputError('Proforma invoices cannot be requested for a cancelled order');
        }
        if (order.active || PRE_PLACED_STATES.includes(order.state)) {
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
                .sort((a, b) => a.version - b.version || Number(a.id) - Number(b.id))
                .map(i => [i.organizationId, i] as const),
        );

        const created: ProformaInvoice[] = [];
        let ordinal = maxOrdinal(existing);
        let owner: { counterpartyId: number; branchId: string | null } | undefined;
        let termDays: number | undefined;
        for (const group of content) {
            const head = heads.get(group.organizationId);
            if (decideVersion(head, group, order.currencyCode) !== 'create') continue;
            owner ??= await this.resolveOwner(ctx, order);
            termDays ??= await this.paymentTermDays(ctx, owner.branchId);
            const documentOrdinal = head ? ordinalOf(head) : (ordinal += 1);
            const version = head ? head.version + 1 : 1;
            const issuedAt = new Date();
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
                    version,
                    kind: head ? 'order-changed' : 'order-placed',
                    issuedAt,
                    dueDate: addDays(issuedAt, termDays),
                    supersedesId: head ? Number(head.id) : null,
                    number: this.numberingService.formatOrderDocumentNumber(
                        order.code,
                        documentOrdinal,
                        version,
                    ),
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

    // Branch setting of the order's servicing branch, falling back to the default branch's, then the constant.
    private async paymentTermDays(ctx: RequestContext, branchId: string | null): Promise<number> {
        const settings = await this.branchSettingsService.resolveEffective(ctx, branchId);
        return settings?.proformaPaymentTermDays ?? DEFAULT_PROFORMA_PAYMENT_TERM_DAYS;
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
                lines: { productVariant: { translations: true }, taxCategory: true },
            },
        });
        if (!order) throw new Error(`Order ${orderId} not found`);
        for (const line of order.lines) {
            line.productVariant = this.translator.translate(line.productVariant, ctx);
        }
        return order;
    }
}
