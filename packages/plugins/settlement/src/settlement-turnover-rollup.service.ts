import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { processTimeZone } from './counterparty-metrics.windows';
import { SettlementDocument } from './entities/settlement-document.entity';
import { ROLLUP_DELETE_SQL, ROLLUP_INSERT_SQL } from './settlement-turnover-rollup.sql';

@Injectable()
export class SettlementTurnoverRollupService {
    constructor(private readonly connection: TransactionalConnection) {}

    // Caller holds the counterparty locks and runs inside the apply transaction.
    async recompute(
        ctx: RequestContext,
        counterpartyErpIds: string[],
        touchedFrom: Date | null,
    ): Promise<void> {
        const ids = [...new Set(counterpartyErpIds)];
        if (ids.length === 0) return;
        const repo = this.connection.getRepository(ctx, SettlementDocument);
        const zone = processTimeZone();
        await repo.query(ROLLUP_DELETE_SQL, [ids, zone, touchedFrom]);
        await repo.query(ROLLUP_INSERT_SQL, [ids, zone]);
    }
}
