import { Args, Query, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    Order,
    PaginatedList,
    Permission,
    RequestContext,
    UserInputError,
} from '@vendure/core';
import { OrderListOptions } from '@vendure/common/lib/generated-types';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';

import { PaymentAttempt } from './entities/payment-attempt.entity';

export type PaymentView = 'unpaid' | 'partial' | 'paid';
const PAYMENT_VIEWS: PaymentView[] = ['unpaid', 'partial', 'paid'];

// Lives here, not in plugin-erp-order: that plugin can't depend on PaymentAttempt (circular dep).
// Must filter and paginate in the DB; in-memory paging would load every order.
@Resolver()
export class AdminOrderPaymentViewResolver {
    constructor(private orderVisibilityService: OrderVisibilityService) {}

    @Query()
    @Allow(Permission.ReadOrder)
    async customerOrdersByPaymentView(
        @Ctx() ctx: RequestContext,
        @Args() args: { customerId: string; paymentView: string; options?: OrderListOptions },
    ): Promise<PaginatedList<Order>> {
        if (!(PAYMENT_VIEWS as string[]).includes(args.paymentView)) {
            throw new UserInputError(
                `paymentView must be one of ${PAYMENT_VIEWS.join(', ')}, got "${args.paymentView}"`,
            );
        }
        const paymentView = args.paymentView as PaymentView;

        const qb = await this.orderVisibilityService.buildVisibleOrdersQuery(
            ctx,
            args.options,
            undefined,
            args.customerId,
        );

        // Correlated subquery, not a JOIN — a JOIN against payment_attempt (one order can have
        // several attempts) would multiply Order rows in a paginated list.
        const capturedAmount = qb
            .subQuery()
            .select('COALESCE(SUM(payment_attempt.amount), 0)')
            .from(PaymentAttempt, 'payment_attempt')
            .where(`payment_attempt."orderId" = "${qb.alias}".id`)
            .andWhere(`payment_attempt."paymentStatus" = 'captured'`)
            .getQuery();

        // totalWithTax is a TS getter, not a column, so SQL must sum subTotalWithTax and shippingWithTax.
        // Same expression Vendure core uses in its own raw-SQL aggregates.
        const totalWithTax = `("${qb.alias}"."subTotalWithTax" + "${qb.alias}"."shippingWithTax")`;
        if (paymentView === 'unpaid') {
            qb.andWhere(`(${capturedAmount}) <= 0`);
        } else if (paymentView === 'partial') {
            qb.andWhere(`(${capturedAmount}) > 0 AND (${capturedAmount}) < ${totalWithTax}`);
        } else {
            qb.andWhere(`(${capturedAmount}) >= ${totalWithTax}`);
        }

        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }
}
