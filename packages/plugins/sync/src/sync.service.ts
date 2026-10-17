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
// A timed-out publish may still reach the broker and is sent again; consumers dedupe by eventId.
const PUBLISH_TIMEOUT_MS = 10_000;

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
        const seen: number[] = [];
        for (let i = 0; i < BATCH_SIZE; i++) {
            const more = await this.dataSource.transaction(async em => {
                const entry = await this.claimNextEntry(em, seen);
                if (!entry) return false;
                seen.push(entry.id);
                await this.publishEntry(em, entry);
                return true;
            });
            if (!more) return;
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

    // The row lock is held through publish so overlapping sweeps skip an in-flight entry.
    private async claimNextEntry(
        em: EntityManager,
        seen: number[],
    ): Promise<SyncOutboxEntry | null> {
        const qb = em
            .getRepository(SyncOutboxEntry)
            .createQueryBuilder('e')
            .where("e.status = 'pending'")
            .andWhere('e.retryCount < :max', { max: this.maxRetry });
        if (seen.length) qb.andWhere('e.id NOT IN (:...seen)', { seen });
        return qb
            .orderBy('e.createdAt', 'ASC')
            .limit(1)
            .setLock('pessimistic_write')
            .setOnLocked('skip_locked')
            .getOne();
    }

    // A hung broker must not pin the claim transaction (and its connection) forever.
    private async publishWithTimeout(key: string, event: SyncEvent): Promise<void> {
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`publish timed out after ${PUBLISH_TIMEOUT_MS} ms`)),
                PUBLISH_TIMEOUT_MS,
            );
        });
        try {
            await Promise.race([this.rabbitmq.publish(key, event), timeout]);
        } finally {
            clearTimeout(timer);
        }
    }

    private async publishEntry(em: EntityManager, entry: SyncOutboxEntry): Promise<void> {
        try {
            const event = SyncEventSchema.parse({
                eventId: entry.eventId,
                eventType: entry.eventType,
                sourceInstanceId: this.options.instanceId,
                timestamp: entry.createdAt.toISOString(),
                payload: entry.payload,
            });

            // Target is part of the routing key because consumers filter at the broker via binding patterns,
            // not in application code, so the key format is load-bearing for every subscriber.
            await this.publishWithTimeout(`${entry.eventType}.${entry.target}`, event);
            await em.getRepository(SyncOutboxEntry).update(entry.id, {
                deliveredAt: new Date(),
                status: 'delivered',
            });
            this.logger.info(`Published ${entry.eventType} [${entry.eventId}]`);
        } catch (err) {
            const error = String(err);
            const nextRetry = entry.retryCount + 1;
            const failed = nextRetry >= this.maxRetry;
            await em.getRepository(SyncOutboxEntry).update(entry.id, {
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
