import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { CreditTermLimitService } from '@mivend/plugin-access-control';

// Only reader of the credit-term limit; must mirror PriceAdjustmentGateService (plugin-price-entry).
// Above a department-head's configured limit the request escalates to security review.
export type CreditTermDecision = 'within-limit' | 'exceeds-limit';

const DEPARTMENT_HEAD_ROLE_CODE = 'department-head';

@Injectable()
export class CreditTermGateService {
    constructor(private creditTermLimitService: CreditTermLimitService) {}

    async evaluate(
        ctx: RequestContext,
        requestedExtraDays: number,
        requestedAmount: number | null,
    ): Promise<CreditTermDecision> {
        const limit = await this.creditTermLimitService.getLimit(ctx, DEPARTMENT_HEAD_ROLE_CODE);
        // No limit configured — conservative default: escalate rather than silently allow an
        // unbounded extension, same convention as PriceAdjustmentGateService.
        if (!limit) {
            return 'exceeds-limit';
        }
        if (requestedExtraDays > limit.maxExtraDays) {
            return 'exceeds-limit';
        }
        if (
            limit.maxAmount !== null &&
            requestedAmount !== null &&
            requestedAmount > limit.maxAmount
        ) {
            return 'exceeds-limit';
        }
        return 'within-limit';
    }
}
