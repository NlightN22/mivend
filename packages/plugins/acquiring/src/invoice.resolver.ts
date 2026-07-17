import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    CustomerService,
    ForbiddenError,
    OrderLine,
    OrderService,
    PaginatedList,
    Permission,
    RequestContext,
} from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import { Invoice } from './entities/invoice.entity';
import { InvoiceService, InvoiceListOptions } from './invoice.service';
import { PaymentAttemptService, PayInvoiceOutcome } from './payment-attempt.service';
import { PaymentChannel } from './entities/payment-attempt.entity';
import { PaymentInboxProcessorService } from './payment-inbox-processor.service';
import { MoneyAmount, SettlementEntryService } from './settlement-entry.service';

@Resolver()
export class InvoiceAdminResolver {
    constructor(
        private invoiceService: InvoiceService,
        private paymentInboxProcessorService: PaymentInboxProcessorService,
    ) {}

    @Query()
    @Allow(Permission.ReadOrder)
    async invoicesForOrder(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: string },
    ): Promise<Invoice[]> {
        return this.invoiceService.findByOrderId(ctx, Number(args.orderId));
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    async triggerPaymentInboxSweep(
        @Ctx() ctx: RequestContext,
    ): Promise<{ processed: number; failed: number }> {
        return this.paymentInboxProcessorService.processPendingEvents(ctx);
    }
}

@Resolver()
export class InvoiceShopResolver {
    constructor(
        private invoiceService: InvoiceService,
        private customerService: CustomerService,
        private counterpartyService: CounterpartyService,
        private paymentAttemptService: PaymentAttemptService,
        private settlementEntryService: SettlementEntryService,
    ) {}

    @Query()
    @Allow(Permission.Owner)
    async myInvoices(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: InvoiceListOptions },
    ): Promise<PaginatedList<Invoice>> {
        const counterparty = await this.getOwnCounterparty(ctx);
        if (!counterparty) return { items: [], totalItems: 0 };
        return this.invoiceService.findForCounterparty(ctx, counterparty.id, args.options);
    }

    @Query()
    @Allow(Permission.Owner)
    async invoice(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<Invoice | null> {
        const counterparty = await this.getOwnCounterparty(ctx);
        if (!counterparty) return null;
        const invoice = await this.invoiceService.findOne(ctx, Number(args.id));
        if (!invoice || invoice.counterpartyId !== Number(counterparty.id)) return null;
        return invoice;
    }

    @Mutation()
    @Allow(Permission.Owner)
    async payInvoice(
        @Ctx() ctx: RequestContext,
        @Args() args: { invoiceId: string; status: string; channel?: string },
    ): Promise<Invoice> {
        const counterparty = await this.getOwnCounterparty(ctx);
        const invoice = counterparty
            ? await this.invoiceService.findOne(ctx, Number(args.invoiceId))
            : null;
        if (!invoice || invoice.counterpartyId !== Number(counterparty!.id)) {
            throw new ForbiddenError();
        }
        return this.paymentAttemptService.payInvoice(
            ctx,
            Number(invoice.id),
            args.status as PayInvoiceOutcome,
            args.channel ? (args.channel as PaymentChannel) : undefined,
        );
    }

    @Query()
    @Allow(Permission.Owner)
    async myAdvanceBalance(@Ctx() ctx: RequestContext): Promise<MoneyAmount[]> {
        const counterparty = await this.getOwnCounterparty(ctx);
        if (!counterparty) return [];
        return this.settlementEntryService.getAdvanceBalance(ctx, Number(counterparty.id));
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

@Resolver('Invoice')
export class InvoiceFieldResolver {
    constructor(
        private invoiceService: InvoiceService,
        private orderService: OrderService,
    ) {}

    @ResolveField()
    async lines(@Ctx() ctx: RequestContext, @Parent() invoice: Invoice): Promise<OrderLine[]> {
        return this.invoiceService.getLinesForInvoice(ctx, invoice);
    }

    @ResolveField()
    async order(
        @Ctx() ctx: RequestContext,
        @Parent() invoice: Invoice,
    ): Promise<{ id: string; code: string }> {
        const order = await this.orderService.findOne(ctx, invoice.orderId);
        if (!order) {
            throw new Error(`Order ${invoice.orderId} not found for invoice ${invoice.id}`);
        }
        return { id: String(order.id), code: order.code };
    }
}
