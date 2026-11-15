import { Injectable } from '@nestjs/common';
import { EventBus, Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';

import { CounterpartyCreatedEvent } from './counterparty-created.event';
import {
    ActiveStateFields,
    activeStatePatch,
    newCounterpartyFromActiveState,
} from './counterparty-active-state';
import { Counterparty } from './entities/counterparty.entity';
import { loggerCtx } from './types';

// Runs once, in the creating transaction, for a record the stream sees for the first time.
export type OnFirstArrival = (ctx: RequestContext, counterparty: Counterparty) => Promise<void>;

// The counterparty stream's write path: seeds a new record from the event, afterwards moves only the
// ERP-owned fields (counterparty-ownership.ts) and fills an empty owner, never replacing a set one.
@Injectable()
export class CounterpartyStreamStateService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly eventBus: EventBus,
    ) {}

    // Tombstone (name null) only updates isActive, never creates a row. undefined = keep, null = clear.
    async upsertActiveState(
        ctx: RequestContext,
        erpId: string,
        fields: ActiveStateFields,
        onFirstArrival?: OnFirstArrival,
    ): Promise<boolean> {
        return withAggregateLock(this.connection, ctx, `counterparty:${erpId}`, txCtx =>
            this.apply(txCtx, erpId, fields, onFirstArrival),
        );
    }

    private async apply(
        ctx: RequestContext,
        erpId: string,
        fields: ActiveStateFields,
        onFirstArrival?: OnFirstArrival,
    ): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, Counterparty);
        const entity = await repo.findOne({ where: { erpId } });
        if (entity) {
            await repo.update(entity.id, activeStatePatch(fields));
            if (fields.assignedManagerId) {
                await repo
                    .createQueryBuilder()
                    .update()
                    .set({ assignedManagerId: fields.assignedManagerId })
                    .where('id = :id AND "assignedManagerId" IS NULL', { id: entity.id })
                    .execute();
            }
            return true;
        }
        if (!fields.name) return false;
        const created = await repo.save(
            repo.create(newCounterpartyFromActiveState(erpId, fields.name, fields)),
        );
        await onFirstArrival?.(ctx, created);
        this.eventBus.publish(new CounterpartyCreatedEvent(ctx, String(created.id), created.erpId));
        Logger.verbose(`Created partial counterparty erpId=${erpId} from Kafka stream`, loggerCtx);
        return true;
    }
}
