import { Injectable, OnModuleInit } from '@nestjs/common';
import { CheckRegistry, MANAGER_STAGES, MANAGER_SUBJECT_TYPE } from '@mivend/plugin-checks';
import type { Finding, ManagerActionSubject } from '@mivend/plugin-checks';

import type { PriceAdjustmentParams } from './price-adjustment-floor.check';

export const PRICE_ADJUSTMENT_AUTOMATIC_CHECK_CODE = 'manager.price-adjustment-automatic-discount';

// A manual and an automatic discount never coexist: on a line with an automatic discount staff may only reduce it.
@Injectable()
export class PriceAdjustmentAutomaticCheck implements OnModuleInit {
    constructor(private registry: CheckRegistry) {}

    onModuleInit(): void {
        this.registry.registerCheck<ManagerActionSubject<PriceAdjustmentParams>>({
            code: PRICE_ADJUSTMENT_AUTOMATIC_CHECK_CODE,
            subjectType: MANAGER_SUBJECT_TYPE,
            stages: [MANAGER_STAGES.adjustPrice],
            description: 'Manual price deepens the automatic discount of the line',
            defaultConsequence: 'block',
            evaluate: subject => Promise.resolve(this.evaluate(subject)),
        });
    }

    evaluate(subject: ManagerActionSubject<PriceAdjustmentParams>): Finding[] {
        const { variantId, direction, hasAutomaticDiscount } = subject.params;
        if (!hasAutomaticDiscount || direction !== 'increases-discount') return [];
        return [
            {
                severity: 'error',
                facts: { variantId, reason: 'deepens-automatic' },
                messageKey: 'manager.price-adjustment-automatic-discount.deepens-automatic',
            },
        ];
    }
}
