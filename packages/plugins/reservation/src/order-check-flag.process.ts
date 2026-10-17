import type { Injector, OrderProcess, OrderState } from '@vendure/core';
import { TransactionalConnection } from '@vendure/core';
import { CheckResult } from '@mivend/plugin-checks';

import { ORDER_SUBJECT_TYPE } from './order-check-subject';

let connection: TransactionalConnection;

// Core saves its in-memory order right after a transition and would revert a flag written meanwhile;
// stamping the stored state onto that same object makes the trailing save carry the right value.
export const orderCheckFlagProcess: OrderProcess<OrderState> = {
    init(injector: Injector) {
        connection = injector.get(TransactionalConnection);
    },
    async onTransitionEnd(_fromState, toState, { ctx, order }) {
        if (toState === 'AddingItems') return;
        const count = await connection
            .getRepository(ctx, CheckResult)
            .count({ where: { subjectType: ORDER_SUBJECT_TYPE, subjectId: String(order.id) } });
        order.customFields = { ...order.customFields, hasCheckFindings: count > 0 };
    },
};
