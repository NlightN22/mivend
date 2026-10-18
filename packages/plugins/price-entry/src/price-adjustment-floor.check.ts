import { Injectable, OnModuleInit } from '@nestjs/common';
import { CheckRegistry, MANAGER_STAGES, MANAGER_SUBJECT_TYPE } from '@mivend/plugin-checks';
import type { CheckContext, Finding, ManagerActionSubject } from '@mivend/plugin-checks';

import { FloorPriceService } from './floor-price.service';

export const PRICE_FLOOR_CHECK_CODE = 'manager.price-adjustment-floor';

export interface PriceAdjustmentParams {
    variantId: string;
    requestedPrice: number;
}

// Runs regardless of the viewer's rights; the only consumer besides the floorPrice query. Facts never carry the threshold: the manager must not learn
// it from a finding, an error or a stored row.
@Injectable()
export class PriceAdjustmentFloorCheck implements OnModuleInit {
    constructor(
        private registry: CheckRegistry,
        private floorPriceService: FloorPriceService,
    ) {}

    onModuleInit(): void {
        this.registry.registerCheck<ManagerActionSubject<PriceAdjustmentParams>>({
            code: PRICE_FLOOR_CHECK_CODE,
            subjectType: MANAGER_SUBJECT_TYPE,
            stages: [MANAGER_STAGES.adjustPrice],
            description: 'Manual price is below the floor price, or no floor price is known',
            defaultConsequence: 'require-approval',
            evaluate: (subject, context) => this.evaluate(subject, context),
        });
    }

    async evaluate(
        subject: ManagerActionSubject<PriceAdjustmentParams>,
        { ctx }: CheckContext,
    ): Promise<Finding[]> {
        const { variantId, requestedPrice } = subject.params;
        const floorPrice =
            (await this.floorPriceService.forVariants(ctx, [variantId])).get(variantId) ?? null;
        // No floor yet (ERP hasn't pushed one): flagged, never unlimited discounting.
        if (floorPrice !== null && requestedPrice >= floorPrice) return [];
        return [
            {
                severity: 'warning',
                facts: { variantId, reason: floorPrice === null ? 'no-floor' : 'below-floor' },
                messageKey: 'manager.price-adjustment-floor.below-floor',
            },
        ];
    }
}
