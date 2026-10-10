import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    CustomerService,
    EntityNotFoundError,
    Order,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';

import { CancelOrderResult, toCancelOrderResult } from './order-cancel-entry.result';
import { OrderCancellationService } from './order-cancellation.service';

// Customer and staff entry points over OrderCancellationService; each only resolves which order
// the actor may touch, the decision itself stays in decideCancellation.
@Injectable()
export class OrderCancelEntryService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private visibility: OrderVisibilityService,
        private cancellation: OrderCancellationService,
    ) {}

    async cancelAsCustomer(ctx: RequestContext, code: string): Promise<CancelOrderResult> {
        const customer = ctx.activeUserId
            ? await this.customerService.findOneByUserId(ctx, ctx.activeUserId)
            : undefined;
        const order = customer
            ? await this.connection
                  .getRepository(ctx, Order)
                  .findOne({ where: { code, customer: { id: customer.id } } })
            : null;
        if (!order) throw new EntityNotFoundError('Order', code);
        return toCancelOrderResult(
            await this.cancellation.cancel(ctx, order.id, 'customer-request'),
        );
    }

    async cancelAsStaff(ctx: RequestContext, orderId: ID): Promise<CancelOrderResult> {
        const qb = await this.visibility.buildVisibleOrdersQuery(ctx);
        const order = await qb.andWhere(`${qb.alias}.id = :orderId`, { orderId }).getOne();
        if (!order) throw new EntityNotFoundError('Order', String(orderId));
        return toCancelOrderResult(await this.cancellation.cancel(ctx, order.id, 'staff-request'));
    }
}
