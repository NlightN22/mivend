import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Allow,
    Ctx,
    CustomerService,
    EntityNotFoundError,
    ForbiddenError,
    Order,
    Permission,
    RequestContext,
    Transaction,
    TransactionalConnection,
} from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';

import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { ProformaInvoiceIssuingService } from './proforma-invoice-issuing.service';

@Resolver()
export class ProformaInvoiceRequestShopResolver {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private counterpartyService: CounterpartyService,
        private issuing: ProformaInvoiceIssuingService,
    ) {}

    @Transaction()
    @Mutation()
    @Allow(Permission.Owner)
    async requestProformaInvoices(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderCode: string },
    ): Promise<ProformaInvoice[]> {
        const customer = ctx.activeUserId
            ? await this.customerService.findOneByUserId(ctx, ctx.activeUserId)
            : undefined;
        const own = customer
            ? await this.counterpartyService.getForCustomer(ctx, customer.id)
            : undefined;
        const order = await this.connection
            .getRepository(ctx, Order)
            .findOne({ where: { code: args.orderCode }, relations: { customer: true } });
        const owner =
            own && order?.customer
                ? await this.counterpartyService.getForCustomer(ctx, order.customer.id)
                : undefined;
        if (!own || !order || !owner || String(owner.id) !== String(own.id)) {
            throw new ForbiddenError();
        }
        return this.issuing.requestForOrder(ctx, order.id);
    }
}

@Resolver()
export class ProformaInvoiceRequestAdminResolver {
    constructor(
        private visibility: OrderVisibilityService,
        private issuing: ProformaInvoiceIssuingService,
    ) {}

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateOrder)
    async requestProformaInvoicesForOrder(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID },
    ): Promise<ProformaInvoice[]> {
        const qb = await this.visibility.buildVisibleOrdersQuery(ctx);
        const visible = await qb
            .andWhere(`${qb.alias}.id = :orderId`, { orderId: args.orderId })
            .getOne();
        if (!visible) throw new EntityNotFoundError('Order', String(args.orderId));
        return this.issuing.requestForOrder(ctx, visible.id);
    }
}
