import { Query, Resolver } from '@nestjs/graphql';
import { Allow } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { DataSource } from 'typeorm';

import { KafkaConsumerLagEntry } from './entities/kafka-consumer-lag.entity';

export interface KafkaTopicLagPartition {
    partition: number;
    committedOffset: string | null;
    endOffset: string;
    lag: string | null;
}

export interface KafkaTopicLag {
    topic: string;
    stream: string;
    totalLag: string | null;
    polledAt: Date;
    partitions: KafkaTopicLagPartition[];
}

// Groups the flat per-(topic, partition) rows KafkaLagPollerService persists into one entry per
// topic — kept as a plain, independently-testable function per AGENTS.md's "clean separation"
// (resolvers do not contain business logic).
export function groupLagRowsByTopic(rows: KafkaConsumerLagEntry[]): KafkaTopicLag[] {
    const byTopic = new Map<string, KafkaConsumerLagEntry[]>();
    for (const row of rows) {
        const existing = byTopic.get(row.topic);
        if (existing) existing.push(row);
        else byTopic.set(row.topic, [row]);
    }

    return [...byTopic.entries()].map(([topic, topicRows]) => {
        // Unknown (null) lag on any partition makes the topic total unknown too — summing a
        // missing figure as 0 would understate a topic that has a genuinely-never-committed
        // partition, silently hiding exactly the "no signal yet" case this whole feature exists
        // to surface.
        const totalLag = topicRows.some(r => r.lag === null)
            ? null
            : String(topicRows.reduce((sum, r) => sum + BigInt(r.lag as string), 0n));
        const polledAt = topicRows.reduce(
            (latest, r) => (r.polledAt > latest ? r.polledAt : latest),
            topicRows[0].polledAt,
        );
        return {
            topic,
            stream: topicRows[0].stream,
            totalLag,
            polledAt,
            partitions: topicRows
                .map(r => ({
                    partition: r.partition,
                    committedOffset: r.committedOffset,
                    endOffset: r.endOffset,
                    lag: r.lag,
                }))
                .sort((a, b) => a.partition - b.partition),
        };
    });
}

@Resolver()
export class KafkaLagResolver {
    constructor(private dataSource: DataSource) {}

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async kafkaConsumerLag(): Promise<KafkaTopicLag[]> {
        const rows = await this.dataSource.getRepository(KafkaConsumerLagEntry).find();
        return groupLagRowsByTopic(rows);
    }
}
