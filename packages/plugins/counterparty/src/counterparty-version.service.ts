import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { EventBus, RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { CounterpartyVersionedEvent } from './counterparty-versioned.event';

// The only place a counterparty's version moves; inbound stream writes never call it.
@Injectable()
export class CounterpartyVersionService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly eventBus: EventBus,
    ) {}

    // The UPDATE takes the row lock and returns the new value, so concurrent bumps get distinct
    // increasing versions. The event reaches subscribers only after the surrounding transaction commits.
    async bump(ctx: RequestContext, counterpartyId: ID): Promise<number> {
        const rows = await this.bumpMany(ctx, [counterpartyId]);
        const row = rows[0];
        if (!row) throw new Error(`Counterparty not found for version bump: id=${counterpartyId}`);
        return row.version;
    }

    async bumpMany(
        ctx: RequestContext,
        counterpartyIds: readonly ID[],
    ): Promise<Array<{ erpId: string; version: number }>> {
        if (counterpartyIds.length === 0) return [];
        const rows = await ctxQuery<Array<{ erpId: string; version: number }>>(
            this.connection,
            ctx,
            `WITH u AS (UPDATE counterparty SET version = version + 1 WHERE id = ANY($1::int[])
                        RETURNING "erpId", version)
             SELECT "erpId", version FROM u`,
            [counterpartyIds.map(id => Number(id))],
        );
        for (const row of rows) {
            this.eventBus.publish(new CounterpartyVersionedEvent(ctx, row.erpId, row.version));
        }
        return rows;
    }
}
