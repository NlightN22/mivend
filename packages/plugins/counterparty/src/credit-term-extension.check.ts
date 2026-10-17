import { Injectable, OnModuleInit } from '@nestjs/common';
import { CreditTermLimitService } from '@mivend/plugin-access-control';
import { CheckRegistry, MANAGER_STAGES, MANAGER_SUBJECT_TYPE } from '@mivend/plugin-checks';
import type { CheckContext, Finding, ManagerActionSubject } from '@mivend/plugin-checks';

export const CREDIT_TERM_CHECK_CODE = 'manager.credit-term-extension';

export interface CreditTermParams {
    requestedExtraDays: number;
    requestedAmount: number | null;
}

// The policy recipient is the role whose limit the request is judged against (the first-tier
// approver); no recipient or no limit for it reads as over the limit, never unlimited.
@Injectable()
export class CreditTermExtensionCheck implements OnModuleInit {
    constructor(
        private registry: CheckRegistry,
        private limits: CreditTermLimitService,
    ) {}

    onModuleInit(): void {
        this.registry.registerCheck<ManagerActionSubject<CreditTermParams>>({
            code: CREDIT_TERM_CHECK_CODE,
            subjectType: MANAGER_SUBJECT_TYPE,
            stages: [MANAGER_STAGES.extendCreditTerm],
            description: "Credit-term extension exceeds the approver role's days or amount limit",
            defaultConsequence: 'require-approval',
            evaluate: (subject, context) => this.evaluate(subject, context),
        });
    }

    async evaluate(
        subject: ManagerActionSubject<CreditTermParams>,
        { ctx, recipient }: CheckContext,
    ): Promise<Finding[]> {
        const { requestedExtraDays, requestedAmount } = subject.params;
        const limit = recipient ? await this.limits.getLimit(ctx, recipient) : null;
        const facts = { requestedExtraDays, requestedAmount };
        const finding = (reason: string): Finding[] => [
            {
                severity: 'warning',
                facts: { ...facts, reason },
                messageKey: 'manager.credit-term-extension.over-limit',
            },
        ];
        if (!limit) return finding('no-limit');
        if (requestedExtraDays > limit.maxExtraDays) return finding('days');
        if (
            limit.maxAmount !== null &&
            requestedAmount !== null &&
            requestedAmount > limit.maxAmount
        ) {
            return finding('amount');
        }
        return [];
    }
}
