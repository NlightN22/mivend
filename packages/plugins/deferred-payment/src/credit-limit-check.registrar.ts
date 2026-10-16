import { Injectable, OnModuleInit } from '@nestjs/common';
import { Order, TransactionalConnection } from '@vendure/core';
import { CheckRegistry } from '@mivend/plugin-checks';

import { CREDIT_LIMIT_CHECK_CODE, evaluateCreditLimit } from './credit-limit.check';
import { DeferredCreditAssessmentService } from './deferred-credit-assessment.service';

@Injectable()
export class CreditLimitCheckRegistrar implements OnModuleInit {
    constructor(
        private registry: CheckRegistry,
        private connection: TransactionalConnection,
        private assessment: DeferredCreditAssessmentService,
    ) {}

    onModuleInit(): void {
        this.registry.registerCheck<{ orderId: string }>({
            code: CREDIT_LIMIT_CHECK_CODE,
            subjectType: 'order',
            stages: ['checkout', 'on-edit'],
            description: "The order amount must fit the buyer's available credit.",
            stageDefaults: { checkout: 'hold', 'on-edit': 'warn' },
            evaluate: async (subject, { ctx }) => {
                const order = await this.connection
                    .getRepository(ctx, Order)
                    .findOne({ where: { id: subject.orderId }, relations: ['customer'] });
                return evaluateCreditLimit(order ? await this.assessment.assess(ctx, order) : null);
            },
        });
    }
}
