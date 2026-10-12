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

import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { ProformaInvoiceService, ProformaInvoiceListOptions } from './proforma-invoice.service';
import { PaymentAttemptService, PayProformaInvoiceOutcome } from './payment-attempt.service';
import { PaymentChannel } from './entities/payment-attempt.entity';
import { PaymentInboxProcessorService } from './payment-inbox-processor.service';
import { MoneyAmount, SettlementEntryService } from './settlement-entry.service';

@Resolver()
export class ProformaInvoiceAdminResolver {
    constructor(
        private proformaInvoiceService: ProformaInvoiceService,
        private paymentInboxProcessorService: PaymentInboxProcessorService,
    ) {}

    @Query()
    @Allow(Permission.ReadOrder)
    async proformaInvoicesForOrder(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: string },
    ): Promise<ProformaInvoice[]> {
        return this.proformaInvoiceService.findByOrderId(ctx, Number(args.orderId));
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
export class ProformaInvoiceShopResolver {
    constructor(
        private proformaInvoiceService: ProformaInvoiceService,
        private customerService: CustomerService,
        private counterpartyService: CounterpartyService,
        private paymentAttemptService: PaymentAttemptService,
        private settlementEntryService: SettlementEntryService,
    ) {}

    @Query()
    @Allow(Permission.Owner)
    async myProformaInvoices(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ProformaInvoiceListOptions },
    ): Promise<PaginatedList<ProformaInvoice>> {
        const counterparty = await this.getOwnCounterparty(ctx);
        if (!counterparty) return { items: [], totalItems: 0 };
        return this.proformaInvoiceService.findForCounterparty(ctx, counterparty.id, args.options);
    }

    @Query()
    @Allow(Permission.Owner)
    async proformaInvoice(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<ProformaInvoice | null> {
        const counterparty = await this.getOwnCounterparty(ctx);
        if (!counterparty) return null;
        const proformaInvoice = await this.proformaInvoiceService.findOne(ctx, Number(args.id));
        if (!proformaInvoice || proformaInvoice.counterpartyId !== Number(counterparty.id))
            return null;
        return proformaInvoice;
    }

    @Mutation()
    @Allow(Permission.Owner)
    async payProformaInvoice(
        @Ctx() ctx: RequestContext,
        @Args() args: { proformaInvoiceId: string; status: string; channel?: string },
    ): Promise<ProformaInvoice> {
        const counterparty = await this.getOwnCounterparty(ctx);
        const proformaInvoice = counterparty
            ? await this.proformaInvoiceService.findOne(ctx, Number(args.proformaInvoiceId))
            : null;
        if (!proformaInvoice || proformaInvoice.counterpartyId !== Number(counterparty!.id)) {
            throw new ForbiddenError();
        }
        return this.paymentAttemptService.payProformaInvoice(
            ctx,
            Number(proformaInvoice.id),
            args.status as PayProformaInvoiceOutcome,
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

@Resolver('ProformaInvoice')
export class ProformaInvoiceFieldResolver {
    constructor(
        private proformaInvoiceService: ProformaInvoiceService,
        private orderService: OrderService,
    ) {}

    @ResolveField()
    async lines(
        @Ctx() ctx: RequestContext,
        @Parent() proformaInvoice: ProformaInvoice,
    ): Promise<OrderLine[]> {
        return this.proformaInvoiceService.getLinesForProformaInvoice(ctx, proformaInvoice);
    }

    @ResolveField()
    async order(
        @Ctx() ctx: RequestContext,
        @Parent() proformaInvoice: ProformaInvoice,
    ): Promise<{ id: string; code: string }> {
        const order = await this.orderService.findOne(ctx, proformaInvoice.orderId);
        if (!order) {
            throw new Error(
                `Order ${proformaInvoice.orderId} not found for proforma invoice ${proformaInvoice.id}`,
            );
        }
        return { id: String(order.id), code: order.code };
    }
}
