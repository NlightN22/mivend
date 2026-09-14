import { Inject, Injectable } from '@nestjs/common';
import { Logger } from '@vendure/core';
import { DataSource } from 'typeorm';
import { Kafka } from 'kafkajs';
import type { Admin, SASLOptions } from 'kafkajs';

import { KafkaConsumerLagEntry } from './entities/kafka-consumer-lag.entity';
import {
    ERP_INTEGRATION_PLUGIN_OPTIONS,
    KAFKA_LAG_WARN_THRESHOLD_DEFAULT,
    loggerCtx,
} from './types';
import type { ErpIntegrationPluginOptions, InboundStream } from './types';

export interface KafkaLagPollResult {
    polledTopics: number;
    failedTopics: string[];
}

// Issue #91: exposes the one signal `KafkaConsumerStatus`'s boolean connected/disconnected flag
// cannot — a consumer that is "connected" can still be falling behind indefinitely (a stuck
// downstream processor, a slow inbox write, a partition rebalance storm) with zero observable
// trace until someone notices stale data in mivend. See the consumer-resilience-audit skill's
// must-have #4 ("lag == 0 is never treated as proof of successful processing") for the general
// pattern this closes.
//
// Persisted (KafkaConsumerLagEntry rows), never an in-memory-only gauge — same bridging reason as
// KafkaConsumerStatus: this poller runs in the worker process (ScheduledTask), while anything
// reading the result (the admin GraphQL query, the dashboard page) is served by the main HTTP
// process. Uses its own short-lived Admin client, entirely separate from KafkaConsumerService's
// long-lived Consumer — an Admin connection is only needed for the duration of one poll.
@Injectable()
export class KafkaLagPollerService {
    constructor(
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
        private readonly dataSource: DataSource,
    ) {}

    async pollAll(): Promise<KafkaLagPollResult> {
        const admin = this.createAdmin();
        const failedTopics: string[] = [];
        let polledTopics = 0;
        await admin.connect();
        try {
            // Each topic is polled independently and a failure is isolated to that topic — same
            // per-topic isolation the consumer's own subscribe loop uses (external-integration-
            // rules skill) — one topic Integration Service has denied/moved must never blank out
            // the lag figure for every OTHER, perfectly healthy topic.
            for (const [stream, topic] of Object.entries(this.options.kafkaConsumer.topics)) {
                try {
                    await this.pollTopic(admin, stream as InboundStream, topic);
                    polledTopics += 1;
                } catch (err) {
                    failedTopics.push(topic);
                    Logger.error(
                        `Failed to poll Kafka lag for topic=${topic} (stream=${stream}): ${
                            err instanceof Error ? err.message : String(err)
                        } — other topics still polled`,
                        loggerCtx,
                    );
                }
            }
        } finally {
            await admin.disconnect();
        }
        return { polledTopics, failedTopics };
    }

    private createAdmin(): Admin {
        const kafka = new Kafka({
            clientId: `${this.options.kafkaConsumer.clientId}-lag-poller`,
            brokers: this.options.kafkaConsumer.brokers,
            ssl: this.options.kafkaConsumer.ssl,
            sasl: this.options.kafkaConsumer.sasl as SASLOptions | undefined,
        });
        return kafka.admin();
    }

    private async pollTopic(admin: Admin, stream: InboundStream, topic: string): Promise<void> {
        const [topicOffsets, groupOffsets] = await Promise.all([
            admin.fetchTopicOffsets(topic),
            admin.fetchOffsets({ groupId: this.options.kafkaConsumer.groupId, topics: [topic] }),
        ]);
        const committedByPartition = new Map<number, string>();
        for (const group of groupOffsets) {
            for (const p of group.partitions) {
                // kafkajs reports -1 for a partition the consumer group has never committed an
                // offset for — that is "unknown", not "zero lag", and must not be treated as a
                // real offset (see KafkaConsumerLagEntry's own doc comment).
                if (p.offset !== '-1') committedByPartition.set(p.partition, p.offset);
            }
        }

        const polledAt = new Date();
        const threshold = this.options.kafkaLagWarnThreshold ?? KAFKA_LAG_WARN_THRESHOLD_DEFAULT;
        for (const { partition, offset: endOffset } of topicOffsets) {
            const committedOffset = committedByPartition.get(partition) ?? null;
            const lag =
                committedOffset === null
                    ? null
                    : String(BigInt(endOffset) - BigInt(committedOffset));

            await this.dataSource
                .getRepository(KafkaConsumerLagEntry)
                .upsert(
                    { topic, partition, stream, committedOffset, endOffset, lag, polledAt },
                    { conflictPaths: ['topic', 'partition'] },
                );

            if (lag !== null && BigInt(lag) > BigInt(threshold)) {
                Logger.warn(
                    `Kafka consumer lag for topic=${topic} partition=${partition} is ${lag} (threshold ${threshold})`,
                    loggerCtx,
                );
            }
        }
    }
}
