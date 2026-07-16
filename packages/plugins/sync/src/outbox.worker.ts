import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';

import { SyncService } from './sync.service';
import { SyncLogger } from './sync-logger';
import { ERP_POLL_INTERVAL_DEFAULT, POLL_INTERVAL_DEFAULT, SYNC_PLUGIN_OPTIONS } from './types';
import type { SyncPluginOptions } from './types';

const QUEUE_NAME = 'sync-outbox';

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
    private queue!: Queue;
    private worker!: Worker;

    constructor(
        private readonly syncService: SyncService,
        private readonly logger: SyncLogger,
        @Inject(SYNC_PLUGIN_OPTIONS) private readonly options: SyncPluginOptions,
    ) {}

    async onModuleInit(): Promise<void> {
        // Draining `sync_outbox` → RabbitMQ (the 'scan' job) must run on EVERY instance, not
        // just central — a branch-placed order's `order.created` (target: 'central', see
        // OrderConsumer) is written to the *branch's own* outbox and needs the branch's own
        // OutboxWorker to publish it. This was previously gated on `instanceType === 'central'`
        // entirely (a real, live-verified bug found 2026-07-15: every branch-origin outbox
        // entry sat at status='pending' forever, since nothing ever drained it) — only the
        // ERP-polling job ('scan-erp', real 1C integration) is genuinely central-only, per
        // AGENTS.md's "Branches never call the ERP".
        const connection = {
            host: this.options.redis.host,
            port: this.options.redis.port,
            password: this.options.redis.password,
            db: this.options.redis.db,
        };

        this.queue = new Queue(QUEUE_NAME, { connection });
        this.worker = new Worker(
            QUEUE_NAME,
            async job => {
                if (job.name === 'scan-erp') {
                    await this.pollErp();
                } else {
                    await this.syncService.processOutbox();
                }
            },
            { connection },
        );

        this.worker.on('failed', (_job, err) => {
            this.logger.error(`Outbox job failed`, err);
        });

        const outboxMs = this.options.outboxPollIntervalMs ?? POLL_INTERVAL_DEFAULT;
        await this.queue.upsertJobScheduler('scan', { every: outboxMs });

        if (this.options.instanceType === 'central') {
            const erpMs = this.options.erpPollIntervalMs ?? ERP_POLL_INTERVAL_DEFAULT;
            await this.queue.upsertJobScheduler('scan-erp', { every: erpMs });
        }

        this.logger.info(
            `OutboxWorker started (outbox=${outboxMs}ms${
                this.options.instanceType === 'central'
                    ? `, erp=${this.options.erpPollIntervalMs ?? ERP_POLL_INTERVAL_DEFAULT}ms`
                    : ''
            })`,
        );
    }

    async onModuleDestroy(): Promise<void> {
        await this.worker?.close();
        await this.queue?.close();
    }

    private async pollErp(): Promise<void> {
        if (!this.options.erpAdapter) return;
        const since = await this.syncService.getErpCursor();
        const changeSet = await this.options.erpAdapter.fetchChanges(since);
        await this.syncService.processErpChanges(changeSet);
    }
}
