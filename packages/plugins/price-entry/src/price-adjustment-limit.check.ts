import { Injectable, OnModuleInit } from '@nestjs/common';
import { CheckRegistry, MANAGER_STAGES, MANAGER_SUBJECT_TYPE } from '@mivend/plugin-checks';
import type { CheckContext, Finding, ManagerActionSubject } from '@mivend/plugin-checks';
import { TransactionalConnection } from '@vendure/core';

import { DiscountLimitService } from './discount-limit.service';
import { discountPercent, exceedsCeiling } from './discount-percent';
import { getProductErpId } from './promo-product-lookup';
import type { PriceAdjustmentParams } from './price-adjustment-floor.check';

export const PRICE_ADJUSTMENT_LIMIT_CHECK_CODE = 'manager.price-adjustment-discount-limit';

// Only a request that deepens the line's discount past the actor's own limit is flagged; no limit set means no finding.
// Facts carry the implied percent, never the limit. Runs next to the floor check, which the limit never overrides.
@Injectable()
export class PriceAdjustmentLimitCheck implements OnModuleInit {
    constructor(
        private registry: CheckRegistry,
        private connection: TransactionalConnection,
        private limits: DiscountLimitService,
    ) {}

    onModuleInit(): void {
        this.registry.registerCheck<ManagerActionSubject<PriceAdjustmentParams>>({
            code: PRICE_ADJUSTMENT_LIMIT_CHECK_CODE,
            subjectType: MANAGER_SUBJECT_TYPE,
            stages: [MANAGER_STAGES.adjustPrice],
            description: 'Manual price gives a bigger discount than the limit of the employee',
            defaultConsequence: 'require-approval',
            evaluate: (subject, context) => this.evaluate(subject, context),
        });
    }

    async evaluate(
        subject: ManagerActionSubject<PriceAdjustmentParams>,
        { ctx }: CheckContext,
    ): Promise<Finding[]> {
        const { variantId, requestedPrice, referencePrice, direction } = subject.params;
        if (direction !== 'increases-discount' || referencePrice === null) return [];
        const implied = discountPercent(referencePrice, requestedPrice);
        const administratorId = await this.limits.actorAdministratorId(ctx);
        if (implied === null || !administratorId) return [];
        const productErpId = await getProductErpId(this.connection, ctx, variantId);
        const ceiling = (
            await this.limits.ceilingsForProducts(ctx, administratorId, [productErpId])
        ).get(productErpId);
        if (!exceedsCeiling(implied, ceiling ?? null)) return [];
        return [
            {
                severity: 'warning',
                facts: { variantId, reason: 'over-limit', impliedDiscountPercent: implied },
                messageKey: 'manager.price-adjustment-discount-limit.over-limit',
            },
        ];
    }
}
