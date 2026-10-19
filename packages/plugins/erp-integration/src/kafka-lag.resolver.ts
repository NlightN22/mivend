import { Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext, TransactionalConnection } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

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

// Plain pure function, testable alone: resolvers must not contain business logic.
export function groupLagRowsByTopic(rows: KafkaConsumerLagEntry[]): KafkaTopicLag[] {
    const byTopic = new Map<string, KafkaConsumerLagEntry[]>();
    for (const row of rows) {
        const existing = byTopic.get(row.topic);
        if (existing) existing.push(row);
        else byTopic.set(row.topic, [row]);
    }

    return [...byTopic.entries()].map(([topic, topicRows]) => {
        // Null lag on any partition makes the topic total null; summing it as 0 hides a
        // never-committed partition, the exact "no signal yet" case this feature surfaces.
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
    constructor(private connection: TransactionalConnection) {}

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async kafkaConsumerLag(@Ctx() ctx: RequestContext): Promise<KafkaTopicLag[]> {
        const rows = await this.connection.getRepository(ctx, KafkaConsumerLagEntry).find();
        return groupLagRowsByTopic(rows);
    }
}
