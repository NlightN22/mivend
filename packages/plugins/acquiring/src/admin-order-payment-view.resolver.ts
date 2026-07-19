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

// Real, DB-level filtered + paginated order list for the manager portal's payment-status view
// chips (CustomerOrdersTab.vue's Unpaid/Partially paid/Paid) — lives here, not in
// plugin-erp-order, because plugin-erp-order can't depend on this plugin's PaymentAttempt entity
// (plugin-acquiring already depends on plugin-erp-order transitively via plugin-sync; the
// reverse edge would be a circular package dependency — confirmed via a real `tsc -b` "Project
// references may not form a circular graph" error when tried the other way). Extends the same
// scoped query OrderVisibilityService.findVisible uses (access-control-filtered, customerId
// pre-applied) with a correlated PaymentAttempt subquery, then executes with real skip/take —
// never loads the full order list into memory to filter/paginate client-side.
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

        // Order.totalWithTax is a TS getter (subTotalWithTax + shippingWithTax), not a real
        // column — matches Vendure core's own internal raw-SQL usage of this exact expression
        // (see @vendure/core's OrderService aggregate queries).
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
