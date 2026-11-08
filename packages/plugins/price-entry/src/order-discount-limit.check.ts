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

// Unlike the reservation limits (fail-closed), no limit set means no finding: owner decision, see docs/access-control.md.
// Measured against the limit of whoever runs the stage (staff session); a run without a staff actor has no limit to judge by.
// Facts carry the line's discount percent, never the limit.
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
        const ceilings = await this.limits.ceilingsForProducts(ctx, administratorId, [
            ...new Set(discounts.map(d => d.productErpId)),
        ]);
        return discounts
            .filter(d => exceedsCeiling(d.percent, ceilings.get(d.productErpId) ?? null))
            .map(d => ({
                severity: 'warning' as const,
                lineRef: d.lineId,
                facts: { reason: 'over-limit', discountPercent: d.percent },
                messageKey: 'order.discount-over-limit.over-limit',
            }));
    }
}
