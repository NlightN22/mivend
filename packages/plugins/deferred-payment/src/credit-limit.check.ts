import type { Finding } from '@mivend/plugin-checks';

export const CREDIT_LIMIT_CHECK_CODE = 'credit.limit';

// Rule text: docs/payments.md "Credit limit" (#222). The `checkout` consequence is read by the placement
// decision (hold = manager confirmation, warn = ERP now after the customer's acknowledgement).
export function evaluateCreditLimit(
    assessment: {
        exceeded: boolean;
        availableCredit: number;
        orderAmount: number;
        excessKopecks: number;
    } | null,
): Finding[] {
    if (!assessment?.exceeded) return [];
    return [
        {
            severity: 'warning',
            messageKey: 'credit.limit.exceeded',
            facts: {
                availableCredit: assessment.availableCredit,
                orderAmount: assessment.orderAmount,
                excessKopecks: assessment.excessKopecks,
            },
        },
    ];
}
