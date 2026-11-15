import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { EventBus, RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { TradingPointVersionedEvent } from './trading-point-versioned.event';

// The only place a trading point's version moves; inbound stream writes never call it.
@Injectable()
export class TradingPointVersionService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly eventBus: EventBus,
    ) {}

    // The UPDATE takes the row lock and returns the new value, so concurrent bumps get distinct
    // increasing versions. The event reaches subscribers only after the surrounding transaction commits.
    async bump(ctx: RequestContext, tradingPointId: ID): Promise<number> {
        const rows = await ctxQuery<Array<{ uuid: string; version: number }>>(
            this.connection,
            ctx,
            `WITH u AS (UPDATE trading_point SET version = version + 1 WHERE id = $1 RETURNING uuid, version)
             SELECT uuid, version FROM u`,
            [String(tradingPointId)],
        );
        const row = rows[0];
        if (!row) throw new Error(`TradingPoint not found for version bump: id=${tradingPointId}`);
        this.eventBus.publish(new TradingPointVersionedEvent(ctx, row.uuid, row.version));
        return row.version;
    }
}
