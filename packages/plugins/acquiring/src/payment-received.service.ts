import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';
import {
    AdministratorService,
    EntityNotFoundError,
    Order,
    OrderService,
    Payment,
    PaymentMetadata,
    RequestContext,
    TransactionalConnection,
    UserInputError,
    isGraphQlErrorResult,
} from '@vendure/core';
import { PLACEMENT_KEY, withAggregateLock } from 'shared';

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
        private administratorService: AdministratorService,
    ) {}

    // Idempotent: under the order lock, only Authorized manual payments carrying a placement are settled, so a
    // repeat finds none. A payment that predates placement metadata (legacy) is never settled here.
    async confirm(ctx: RequestContext, orderId: ID, paymentId?: ID | null): Promise<Order> {
        const qb = await this.visibility.buildVisibleOrdersQuery(ctx);
        const visible = await qb.andWhere(`${qb.alias}.id = :orderId`, { orderId }).getOne();
        if (!visible) throw new EntityNotFoundError('Order', String(orderId));

        await withAggregateLock(
            this.connection,
            ctx,
            `payment-received:${orderId}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, Payment);
                const manual = (
                    await repo
                        .createQueryBuilder('p')
                        .where('p."orderId" = :orderId', { orderId })
                        .andWhere('p.method IN (:...methods)', { methods: MANUAL_METHODS })
                        .getMany()
                ).filter(p => Boolean(p.metadata?.[PLACEMENT_KEY]));
                const candidates = paymentId
                    ? manual.filter(p => String(p.id) === String(paymentId))
                    : manual;
                if (candidates.length === 0) {
                    throw new UserInputError('The order has no cash or bank-transfer payment');
                }
                const admin = ctx.activeUserId
                    ? await this.administratorService.findOneByUserId(txCtx, ctx.activeUserId)
                    : undefined;
                for (const payment of candidates.filter(p => p.state === 'Authorized')) {
                    const metadata: PaymentMetadata = {
                        ...payment.metadata,
                        confirmedByAdministratorId: admin ? String(admin.id) : null,
                        confirmedAt: new Date().toISOString(),
                    };
                    await repo.update(payment.id, { metadata });
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
