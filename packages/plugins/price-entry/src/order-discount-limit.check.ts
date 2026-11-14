import { Injectable, OnModuleInit } from '@nestjs/common';
import { CheckRegistry } from '@mivend/plugin-checks';
import type { CheckContext, Finding } from '@mivend/plugin-checks';

import { DiscountLimitService } from './discount-limit.service';
import { exceedsCeiling } from './discount-percent';
import { LineDiscountService } from './line-discount.service';

export const ORDER_DISCOUNT_LIMIT_CHECK_CODE = 'order.discount-over-limit';

interface OrderDiscountSubject {
    orderId: string;
}

// Manual discounts only; no row means a 0% ceiling (docs/access-control.md).
// Judged against the stage runner (no admin = no limit). Facts carry the percent, never the limit.
@Injectable()
export class OrderDiscountLimitCheck implements OnModuleInit {
    constructor(
        private registry: CheckRegistry,
        private limits: DiscountLimitService,
        private lineDiscounts: LineDiscountService,
    ) {}

    onModuleInit(): void {
        this.registry.registerCheck<OrderDiscountSubject>({
            code: ORDER_DISCOUNT_LIMIT_CHECK_CODE,
            subjectType: 'order',
            stages: ['pre-reserve', 'on-edit'],
            description: 'An order line carries a discount above the limit of the employee',
            defaultConsequence: 'warn',
            evaluate: (subject, context) => this.evaluate(subject, context),
        });
    }

    async evaluate(subject: OrderDiscountSubject, { ctx }: CheckContext): Promise<Finding[]> {
        const administratorId = await this.limits.actorAdministratorId(ctx);
        if (!administratorId) return [];
        const discounts = (await this.lineDiscounts.forOrderId(ctx, subject.orderId)).filter(
            d => d.percent !== null && d.percent > 0,
        );
        if (discounts.length === 0) return [];
        const judged = await this.lineDiscounts.limitApplies(ctx, subject.orderId, discounts);
        const ceilings = await this.limits.ceilingsForProducts(ctx, administratorId, [
            ...new Set(discounts.map(d => d.productErpId)),
        ]);
        return discounts
            .filter(
                d =>
                    judged.has(d.lineId) &&
                    exceedsCeiling(d.percent, ceilings.get(d.productErpId) ?? 0),
            )
            .map(d => ({
                severity: 'warning' as const,
                lineRef: d.lineId,
                facts: { reason: 'over-limit', discountPercent: d.percent },
                messageKey: 'order.discount-over-limit.over-limit',
            }));
    }
}
