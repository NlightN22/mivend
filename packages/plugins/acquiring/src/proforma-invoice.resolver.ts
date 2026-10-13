import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import {
    AdministratorService,
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
import { OrderVisibilityService } from '@mivend/plugin-erp-order';

import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { displayStatusOf } from './proforma-invoice-display';
import { ProformaInvoiceWithdrawService } from './proforma-invoice-withdraw.service';
import { ProformaInvoiceService, ProformaInvoiceListOptions } from './proforma-invoice.service';
import { ProformaInvoiceIssuingService } from './proforma-invoice-issuing.service';
import { PaymentAttemptService, PayProformaInvoiceOutcome } from './payment-attempt.service';
import { PaymentChannel } from './entities/payment-attempt.entity';
import { PaymentInboxProcessorService } from './payment-inbox-processor.service';
import { MoneyAmount, SettlementEntryService } from './settlement-entry.service';

@Resolver()
export class ProformaInvoiceAdminResolver {
    constructor(
        private proformaInvoiceService: ProformaInvoiceService,
        private paymentInboxProcessorService: PaymentInboxProcessorService,
        private orderVisibility: OrderVisibilityService,
        private withdrawService: ProformaInvoiceWithdrawService,
        private administratorService: AdministratorService,
    ) {}

    @Mutation()
    @Allow(Permission.UpdateOrder)
    async withdrawProformaInvoice(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<ProformaInvoice> {
        const invoice = await this.proformaInvoiceService.findOne(ctx, Number(args.id));
        const qb = await this.orderVisibility.buildVisibleOrdersQuery(ctx);
        const visible = invoice
            ? await qb.andWhere(`${qb.alias}.id = :orderId`, { orderId: invoice.orderId }).getOne()
            : null;
        if (!invoice || !visible) throw new ForbiddenError();
        const administrator = ctx.activeUserId
            ? await this.administratorService.findOneByUserId(ctx, ctx.activeUserId)
            : null;
        return this.withdrawService.withdraw(
            ctx,
            Number(invoice.id),
            administrator ? String(administrator.id) : null,
        );
    }

    @Query()
    @Allow(Permission.ReadOrder)
    async proformaInvoicesForOrder(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: string },
    ): Promise<ProformaInvoice[]> {
        const qb = await this.orderVisibility.buildVisibleOrdersQuery(ctx);
        const visible = await qb
            .andWhere(`${qb.alias}.id = :orderId`, { orderId: args.orderId })
            .getOne();
        if (!visible) return [];
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

interface SnapshotLine {
    productVariant: { name: string; sku: string };
    quantity: number;
    unitPriceWithTax: number;
    linePriceWithTax: number;
}

interface VersionRef {
    id: string;
    number: string;
    version: number;
}

@Resolver('ProformaInvoice')
export class ProformaInvoiceFieldResolver {
    constructor(
        private proformaInvoiceService: ProformaInvoiceService,
        private issuing: ProformaInvoiceIssuingService,
        private orderService: OrderService,
    ) {}

    @ResolveField()
    lines(@Parent() proformaInvoice: ProformaInvoice): SnapshotLine[] {
        return proformaInvoice.lines.map(line => ({
            productVariant: { name: line.name, sku: line.sku },
            quantity: line.quantity,
            unitPriceWithTax: line.unitPriceWithTax,
            linePriceWithTax: line.linePriceWithTax,
        }));
    }

    @ResolveField()
    displayStatus(@Parent() proformaInvoice: ProformaInvoice): string {
        return displayStatusOf(proformaInvoice.status);
    }

    @ResolveField()
    supersedes(
        @Ctx() ctx: RequestContext,
        @Parent() proformaInvoice: ProformaInvoice,
    ): Promise<VersionRef | null> {
        return this.versionRef(ctx, proformaInvoice.supersedesId);
    }

    @ResolveField()
    supersededBy(
        @Ctx() ctx: RequestContext,
        @Parent() proformaInvoice: ProformaInvoice,
    ): Promise<VersionRef | null> {
        return this.versionRef(ctx, proformaInvoice.supersededById);
    }

    @ResolveField()
    orderChangedDifference(
        @Ctx() ctx: RequestContext,
        @Parent() proformaInvoice: ProformaInvoice,
    ): Promise<number | null> {
        return this.issuing.differenceAfterPayment(ctx, proformaInvoice);
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

    private async versionRef(ctx: RequestContext, id: number | null): Promise<VersionRef | null> {
        if (id == null) return null;
        const other = await this.proformaInvoiceService.findOne(ctx, id);
        return other
            ? { id: String(other.id), number: other.number, version: other.version }
            : null;
    }
}
