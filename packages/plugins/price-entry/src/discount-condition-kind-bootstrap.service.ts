import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ProcessContext, RequestContextService, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { KNOWN_CONDITION_KINDS, KNOWN_OPERATION_KINDS } from './discount-known-kinds';

// Insert-if-missing only, so an operator's edit of a metric survives restarts.
@Injectable()
export class DiscountConditionKindBootstrapService implements OnApplicationBootstrap {
    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private processContext: ProcessContext,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (this.processContext.isWorker) return;
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        await ctxQuery(
            this.connection,
            ctx,
            `INSERT INTO discount_condition_kind ("erpName", metric)
             SELECT n, m FROM unnest($1::text[], $2::text[]) AS t(n, m)
             ON CONFLICT ("erpName") DO NOTHING`,
            [KNOWN_CONDITION_KINDS.map(k => k[0]), KNOWN_CONDITION_KINDS.map(k => k[1])],
        );
        await ctxQuery(
            this.connection,
            ctx,
            `INSERT INTO discount_operation_kind ("erpName") SELECT unnest($1::text[])
             ON CONFLICT ("erpName") DO NOTHING`,
            [KNOWN_OPERATION_KINDS],
        );
    }
}
