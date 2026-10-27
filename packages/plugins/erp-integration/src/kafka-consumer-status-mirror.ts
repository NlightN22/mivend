import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname } from 'path';

import { Logger } from '@vendure/core';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { KafkaConsumerStatus } from './entities/kafka-consumer-status.entity';
import { loggerCtx } from './types';

const STATUS_KEY = 'default';
const PERSIST_MAX_ATTEMPTS = 4;
const PERSIST_RETRY_DELAY_MS = 5000;

// The worker container healthcheck tests this file; it exists only while the consumer is connected.
export const CONSUMER_HEALTH_FILE = '/tmp/kafka-consumer-connected';

const errMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// Mirrors consumer state to the shared status row and the health file. Never throws:
// the latest state wins, failed writes are logged and retried with a bounded count.
export class KafkaConsumerStatusMirror {
    private latest = false;
    private retryTimer: NodeJS.Timeout | undefined;

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly adminCtx: () => Promise<RequestContext>,
    ) {}

    set(connected: boolean): void {
        this.latest = connected;
        if (this.retryTimer) clearTimeout(this.retryTimer);
        void this.writeHealthFile(connected);
        void this.persist(connected, 1);
    }

    async setFinal(connected: boolean): Promise<void> {
        this.latest = connected;
        if (this.retryTimer) clearTimeout(this.retryTimer);
        await this.writeHealthFile(connected);
        await this.upsert(connected).catch(err =>
            Logger.error(
                `Failed to persist final Kafka consumer status: ${errMessage(err)}`,
                loggerCtx,
            ),
        );
    }

    private upsert(connected: boolean): Promise<unknown> {
        return this.adminCtx().then(ctx =>
            this.connection
                .getRepository(ctx, KafkaConsumerStatus)
                .upsert({ key: STATUS_KEY, connected }, { conflictPaths: ['key'] }),
        );
    }

    private async persist(connected: boolean, attempt: number): Promise<void> {
        try {
            await this.upsert(connected);
        } catch (err) {
            Logger.error(
                `Failed to persist Kafka consumer status (attempt ${attempt}/${PERSIST_MAX_ATTEMPTS}): ${errMessage(err)}`,
                loggerCtx,
            );
            if (attempt >= PERSIST_MAX_ATTEMPTS || this.latest !== connected) return;
            this.retryTimer = setTimeout(
                () => void this.persist(connected, attempt + 1),
                PERSIST_RETRY_DELAY_MS,
            );
        }
    }

    private async writeHealthFile(connected: boolean): Promise<void> {
        try {
            if (connected) {
                await mkdir(dirname(CONSUMER_HEALTH_FILE), { recursive: true });
                await writeFile(CONSUMER_HEALTH_FILE, new Date().toISOString());
            } else {
                await unlink(CONSUMER_HEALTH_FILE);
            }
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
            Logger.error(
                `Failed to update Kafka consumer health file: ${errMessage(err)}`,
                loggerCtx,
            );
        }
    }
}
