import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    CustomerService,
    ForbiddenError,
    OrderService,
    PaginatedList,
    Permission,
    RequestContext,
} from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import { Dispute } from './entities/dispute.entity';
import { Invoice } from './entities/invoice.entity';
import { PaymentAttempt, PaymentChannel } from './entities/payment-attempt.entity';
import { PaymentRefund } from './entities/payment-refund.entity';
import { DisputeService } from './dispute.service';
import { InboxService } from './inbox.service';
import { InvoiceService } from './invoice.service';
import {
    PaymentAllocation,
    PaymentAttemptService,
    PaymentListOptions,
} from './payment-attempt.service';
import { PaymentRefundService } from './payment-refund.service';

export interface PaymentProcessingEvent {
    stage: string;
    occurredAt: Date;
    note: string | null;
}

// Only branch-kassa/bank-transfer-erp payments go through the inbox — online-acquiring's
// checkout-time stub never enqueues an IncomingPaymentEvent (see payment-event.listener.ts).
const CHANNEL_TO_INBOX_PROVIDER: Partial<Record<PaymentChannel, string>> = {
    'branch-kassa': 'branch-kassa',
    'bank-transfer-erp': 'erp',
};

// GraphQL "status" aliases the entity's paymentStatus column — kept as a distinct resolver
// field (rather than renaming the DB column) since paymentStatus is the name used throughout
// docs/payments.md and the rest of this plugin.
@Resolver('PaymentAttempt')
export class PaymentFieldResolver {
    constructor(
        private invoiceService: InvoiceService,
        private orderService: OrderService,
        private paymentAttemptService: PaymentAttemptService,
        private paymentRefundService: PaymentRefundService,
        private disputeService: DisputeService,
        private inboxService: InboxService,
    ) {}

    @ResolveField()
    status(@Parent() payment: PaymentAttempt): string {
        return payment.paymentStatus;
    }

    @ResolveField()
    externalReference(@Parent() payment: PaymentAttempt): string | null {
        return payment.providerPaymentId;
    }

    @ResolveField()
    async refunds(
        @Ctx() ctx: RequestContext,
        @Parent() payment: PaymentAttempt,
    ): Promise<PaymentRefund[]> {
        return this.paymentRefundService.findByPaymentId(ctx, Number(payment.id));
    }

    @ResolveField()
    async disputes(
        @Ctx() ctx: RequestContext,
        @Parent() payment: PaymentAttempt,
    ): Promise<Dispute[]> {
        return this.disputeService.findByPaymentId(ctx, Number(payment.id));
    }

    @ResolveField()
    async processingEvents(
        @Ctx() ctx: RequestContext,
        @Parent() payment: PaymentAttempt,
    ): Promise<PaymentProcessingEvent[]> {
        const provider = CHANNEL_TO_INBOX_PROVIDER[payment.channel];
        if (!provider) return [];
        const event = await this.inboxService.findByProviderAndEventId(
            ctx,
            provider,
            payment.providerPaymentId,
        );
        if (!event) return [];

        const stages: PaymentProcessingEvent[] = [
            { stage: 'Received', occurredAt: event.createdAt, note: null },
        ];
        if (event.attempts > 0 || event.status !== 'pending') {
            stages.push({
                stage: 'Processing',
                occurredAt: event.updatedAt,
                note: event.attempts > 0 ? `Attempt ${event.attempts}` : null,
            });
        }
        if (event.status === 'processed' && event.processedAt) {
            stages.push({ stage: 'Processed', occurredAt: event.processedAt, note: null });
        } else if (event.status === 'failed') {
            stages.push({ stage: 'Failed', occurredAt: event.updatedAt, note: event.lastError });
        }
        return stages;
    }

    @ResolveField()
    async invoice(
        @Ctx() ctx: RequestContext,
        @Parent() payment: PaymentAttempt,
    ): Promise<Invoice | null> {
        return payment.invoiceId ? this.invoiceService.findOne(ctx, payment.invoiceId) : null;
    }

    @ResolveField()
    async order(
        @Ctx() ctx: RequestContext,
        @Parent() payment: PaymentAttempt,
    ): Promise<{ id: string; code: string } | null> {
        if (!payment.orderId) return null;
        const order = await this.orderService.findOne(ctx, payment.orderId);
        return order ? { id: String(order.id), code: order.code } : null;
    }

    @ResolveField()
    async allocations(
        @Ctx() ctx: RequestContext,
        @Parent() payment: PaymentAttempt,
    ): Promise<Array<{ invoice: Invoice | null; amount: number; isAdvance: boolean }>> {
        const allocations = await this.paymentAttemptService.getAllocationsForPayment(
            ctx,
            Number(payment.id),
        );
        return allocations.map((a: PaymentAllocation) => ({
            invoice: a.invoice,
            amount: a.settlementEntry.amount,
            isAdvance: a.invoice === null,
        }));
    }
}

@Resolver()
export class PaymentShopResolver {
    constructor(
        private paymentAttemptService: PaymentAttemptService,
        private customerService: CustomerService,
        private counterpartyService: CounterpartyService,
    ) {}

    @Query()
    @Allow(Permission.Owner)
    async myPayments(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: PaymentListOptions },
    ): Promise<PaginatedList<PaymentAttempt>> {
        const counterparty = await this.getOwnCounterparty(ctx);
        if (!counterparty) return { items: [], totalItems: 0 };
        return this.paymentAttemptService.findForCounterparty(ctx, counterparty.id, args.options);
    }

    @Query()
    @Allow(Permission.Owner)
    async payment(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<PaymentAttempt | null> {
        const counterparty = await this.getOwnCounterparty(ctx);
        const payment = counterparty
            ? await this.paymentAttemptService.findOne(ctx, Number(args.id))
            : null;
        if (
            !payment ||
            !(await this.paymentAttemptService.belongsToCounterparty(
                ctx,
                payment,
                counterparty!.id,
            ))
        ) {
            throw new ForbiddenError();
        }
        return payment;
    }

    private async getOwnCounterparty(
        ctx: RequestContext,
    ): Promise<{ id: string | number } | undefined> {
        if (!ctx.activeUserId) return undefined;
        const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
        if (!customer) return undefined;
        const counterparty = await this.counterpartyService.getForCustomer(ctx, customer.id);
        return counterparty ?? undefined;
    }
}
