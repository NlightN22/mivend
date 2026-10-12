import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';
import {
    EntityNotFoundError,
    Order,
    OrderService,
    Payment,
    RequestContext,
    TransactionalConnection,
    UserInputError,
    isGraphQlErrorResult,
} from '@vendure/core';
import { withAggregateLock } from 'shared';

import { CASH_METHOD_CODE } from './cash-handler';
import { OFFLINE_TERMS_METHOD_CODE } from './offline-terms-handler';

const MANUAL_METHODS = [CASH_METHOD_CODE, OFFLINE_TERMS_METHOD_CODE];

// Cash and bank transfer are collected outside Vendure; a manager's confirmation is the payment fact.
@Injectable()
export class PaymentReceivedService {
    constructor(
        private connection: TransactionalConnection,
        private orderService: OrderService,
        private visibility: OrderVisibilityService,
    ) {}

    // Idempotent: under the order lock, only Authorized manual payments are settled, so a repeat finds none.
    async confirm(ctx: RequestContext, orderId: ID): Promise<Order> {
        const qb = await this.visibility.buildVisibleOrdersQuery(ctx);
        const visible = await qb.andWhere(`${qb.alias}.id = :orderId`, { orderId }).getOne();
        if (!visible) throw new EntityNotFoundError('Order', String(orderId));

        await withAggregateLock(
            this.connection,
            ctx,
            `payment-received:${orderId}`,
            async txCtx => {
                const payments = await this.connection
                    .getRepository(txCtx, Payment)
                    .createQueryBuilder('p')
                    .where('p."orderId" = :orderId', { orderId })
                    .andWhere('p.method IN (:...methods)', { methods: MANUAL_METHODS })
                    .getMany();
                if (payments.length === 0) {
                    throw new UserInputError('The order has no cash or bank-transfer payment');
                }
                for (const payment of payments.filter(p => p.state === 'Authorized')) {
                    const result = await this.orderService.settlePayment(txCtx, payment.id);
                    if (isGraphQlErrorResult(result)) throw new UserInputError(result.message);
                }
            },
        );
        const order = await this.orderService.findOne(ctx, orderId);
        if (!order) throw new EntityNotFoundError('Order', String(orderId));
        return order;
    }
}
