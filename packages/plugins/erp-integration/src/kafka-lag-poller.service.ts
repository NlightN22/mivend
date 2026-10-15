import { Inject, Injectable } from '@nestjs/common';
import { Logger } from '@vendure/core';
import { DataSource, In, Not } from 'typeorm';
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

// Persisted, not in-memory: the poller runs in the worker, readers in the main HTTP process.
// Own short-lived Admin client; a connected consumer can still lag indefinitely.
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
            // Each topic is polled in isolation: one denied or moved topic must not blank lag for the rest.
            const topics = this.options.kafkaConsumer.topics;
            const streamByTopic = new Map<string, string>();
            for (const [stream, topic] of Object.entries(topics)) {
                if (!streamByTopic.has(topic)) streamByTopic.set(topic, stream);
            }
            for (const [topic, stream] of streamByTopic) {
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
        const configuredTopics = [...new Set(Object.values(this.options.kafkaConsumer.topics))];
        if (configuredTopics.length > 0) {
            await this.dataSource
                .getRepository(KafkaConsumerLagEntry)
                .delete({ topic: Not(In(configuredTopics)) });
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
                // kafkajs returns -1 for a partition with no committed offset: unknown, not zero lag.
                // Do not treat it as a real offset.
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
