import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ApprovalScopeRegistry, payloadField } from '@mivend/plugin-approval-workflow';

import { CounterpartyService } from './counterparty.service';
import { ESCALATED_REQUEST_TYPE, WITHIN_LIMIT_REQUEST_TYPE } from './credit-term.service';

// A credit-term request belongs to its counterparty: visible and decidable within that counterparty's scope.
@Injectable()
export class CreditTermScopeRegistrar implements OnApplicationBootstrap {
    constructor(
        private readonly registry: ApprovalScopeRegistry,
        private readonly counterparties: CounterpartyService,
    ) {}

    onApplicationBootstrap(): void {
        for (const type of [WITHIN_LIMIT_REQUEST_TYPE, ESCALATED_REQUEST_TYPE])
            this.registry.register(type, async ctx => {
                const visible = await this.counterparties.visibleErpIdsSql(ctx);
                return (
                    visible && {
                        sql: `${payloadField('counterpartyErpId')} IN (${visible.sql})`,
                        params: visible.params,
                    }
                );
            });
    }
}
