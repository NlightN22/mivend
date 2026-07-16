import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, OrderService, Permission, RequestContext } from '@vendure/core';

import { Invoice } from './entities/invoice.entity';
import { InvoiceService } from './invoice.service';

@Resolver()
export class InvoiceAdminResolver {
    constructor(private invoiceService: InvoiceService) {}

    @Query()
    @Allow(Permission.ReadOrder)
    async invoicesForOrder(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: string },
    ): Promise<Invoice[]> {
        return this.invoiceService.findByOrderId(ctx, Number(args.orderId));
    }
}

@Resolver()
export class InvoiceShopResolver {
    constructor(
        private invoiceService: InvoiceService,
        private orderService: OrderService,
    ) {}

    @Query()
    @Allow(Permission.Owner)
    async myInvoices(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: string },
    ): Promise<Invoice[]> {
        if (!ctx.activeUserId) return [];
        const order = await this.orderService.findOne(ctx, args.orderId, [
            'customer',
            'customer.user',
        ]);
        if (!order?.customer?.user || order.customer.user.id !== ctx.activeUserId) {
            return [];
        }
        return this.invoiceService.findByOrderId(ctx, Number(args.orderId));
    }
}
