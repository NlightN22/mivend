import { randomUUID } from 'crypto';

import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';

import { SyncOutboxEntry } from './entities/sync-outbox.entity';
import { RabbitMQService } from './rabbitmq.service';
import { SyncLogger } from './sync-logger';
import { MAX_RETRY_DEFAULT, SYNC_PLUGIN_OPTIONS } from './types';
import type { SyncPluginOptions } from './types';
import type { ErpChangeSet } from './erp-adapter.interface';
import { SyncEventSchema } from 'shared';
import type { SyncEvent } from 'shared';

const BATCH_SIZE = 50;

type OutboxInput = Omit<SyncEvent, 'eventId' | 'sourceInstanceId' | 'timestamp'> & {
    eventId?: string;
};

@Injectable()
export class SyncService {
    private readonly maxRetry: number;

    constructor(
        private readonly dataSource: DataSource,
        private readonly rabbitmq: RabbitMQService,
        @Inject(SYNC_PLUGIN_OPTIONS) private readonly options: SyncPluginOptions,
        private readonly logger: SyncLogger,
    ) {
        this.maxRetry = options.maxRetry ?? MAX_RETRY_DEFAULT;
    }

    async writeToOutbox(em: EntityManager, event: OutboxInput, target: string): Promise<void> {
        const entry = em.getRepository(SyncOutboxEntry).create({
            eventId: event.eventId ?? randomUUID(),
            eventType: event.eventType,
            payload: event.payload as Record<string, unknown>,
            target,
            status: 'pending',
            deliveredAt: null,
            retryCount: 0,
            lastError: null,
            lastErrorAt: null,
        });
        await em.getRepository(SyncOutboxEntry).save(entry);
    }

    async processOutbox(): Promise<void> {
        const entries = await this.claimPendingEntries();
        for (const entry of entries) {
            await this.publishEntry(entry);
        }
    }

    async getErpCursor(): Promise<Date> {
        const last = await this.dataSource.getRepository(SyncOutboxEntry).findOne({
            where: { status: 'delivered', deliveredAt: IsNull() as never },
            order: { deliveredAt: 'DESC' },
        });
        return last?.deliveredAt ?? new Date(0);
    }

    async processErpChanges(changeSet: ErpChangeSet): Promise<void> {
        await this.dataSource.transaction(async em => {
            for (const event of changeSet.events) {
                await this.writeToOutbox(
                    em,
                    {
                        eventType: event.type as SyncEvent['eventType'],
                        payload: event.payload as SyncEvent['payload'],
                    },
                    'all-branches',
                );
            }
        });
    }

    private async claimPendingEntries(): Promise<SyncOutboxEntry[]> {
        return this.dataSource.transaction(async em => {
            return em
                .getRepository(SyncOutboxEntry)
                .createQueryBuilder('e')
                .where("e.status = 'pending'")
                .andWhere('e.retryCount < :max', { max: this.maxRetry })
                .orderBy('e.createdAt', 'ASC')
                .limit(BATCH_SIZE)
                .setLock('pessimistic_write')
                .setOnLocked('skip_locked')
                .getMany();
        });
    }

    private async publishEntry(entry: SyncOutboxEntry): Promise<void> {
        try {
            const event = SyncEventSchema.parse({
                eventId: entry.eventId,
                eventType: entry.eventType,
                sourceInstanceId: this.options.instanceId,
                timestamp: entry.createdAt.toISOString(),
                payload: entry.payload,
            });

            // Routing key = `<eventType>.<target>` — `target` was previously advisory-only
            // metadata (never enforced at the messaging layer, every queue bound `#` and
            // filtered in application code). Now it's the actual routing mechanism: each
            // consumer binds only to the target patterns it cares about. See
            // RabbitMQService.subscribe's comment for why.
            await this.rabbitmq.publish(`${entry.eventType}.${entry.target}`, event);
            await this.dataSource.getRepository(SyncOutboxEntry).update(entry.id, {
                deliveredAt: new Date(),
                status: 'delivered',
            });
            this.logger.info(`Published ${entry.eventType} [${entry.eventId}]`);
        } catch (err) {
            const error = String(err);
            const nextRetry = entry.retryCount + 1;
            const failed = nextRetry >= this.maxRetry;
            await this.dataSource.getRepository(SyncOutboxEntry).update(entry.id, {
                retryCount: nextRetry,
                lastError: error,
                lastErrorAt: new Date(),
                ...(failed ? { status: 'failed' } : {}),
            });
            this.logger.error(`Failed to publish ${entry.eventType} [${entry.eventId}]`, err);
            if (failed) this.logger.dlq(entry.eventId, error);
        }
    }
}
