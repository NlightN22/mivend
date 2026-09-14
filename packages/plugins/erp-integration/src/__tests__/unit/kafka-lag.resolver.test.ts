import { describe, expect, it } from 'vitest';

import { groupLagRowsByTopic } from '../../kafka-lag.resolver';
import type { KafkaConsumerLagEntry } from '../../entities/kafka-consumer-lag.entity';

function row(overrides: Partial<KafkaConsumerLagEntry>): KafkaConsumerLagEntry {
    return {
        topic: 'topic-a',
        stream: 'category',
        partition: 0,
        committedOffset: '60',
        endOffset: '100',
        lag: '40',
        polledAt: new Date('2026-01-01T00:00:00Z'),
        ...overrides,
    } as KafkaConsumerLagEntry;
}

describe('groupLagRowsByTopic', () => {
    it('sums lag across partitions of the same topic', () => {
        const result = groupLagRowsByTopic([
            row({ partition: 0, lag: '40' }),
            row({ partition: 1, lag: '10' }),
        ]);
        expect(result).toEqual([expect.objectContaining({ topic: 'topic-a', totalLag: '50' })]);
        expect(result[0].partitions.map(p => p.partition)).toEqual([0, 1]);
    });

    it('reports totalLag as "0" (not null) when every partition is fully caught up', () => {
        const result = groupLagRowsByTopic([
            row({ partition: 0, lag: '0', committedOffset: '100', endOffset: '100' }),
            row({ partition: 1, lag: '0', committedOffset: '50', endOffset: '50' }),
        ]);
        expect(result[0].totalLag).toBe('0');
    });

    it('reports totalLag as null when any partition has unknown lag', () => {
        const result = groupLagRowsByTopic([
            row({ partition: 0, lag: '40' }),
            row({ partition: 1, lag: null, committedOffset: null }),
        ]);
        expect(result[0].totalLag).toBeNull();
    });

    it('groups independently per topic', () => {
        const result = groupLagRowsByTopic([
            row({ topic: 'topic-a', partition: 0, lag: '40' }),
            row({ topic: 'topic-b', stream: 'product', partition: 0, lag: '5' }),
        ]);
        expect(result.map(r => r.topic).sort()).toEqual(['topic-a', 'topic-b']);
    });

    it("reports the latest polledAt across a topic's partitions", () => {
        const older = new Date('2026-01-01T00:00:00Z');
        const newer = new Date('2026-01-02T00:00:00Z');
        const result = groupLagRowsByTopic([
            row({ partition: 0, polledAt: older }),
            row({ partition: 1, polledAt: newer }),
        ]);
        expect(result[0].polledAt).toEqual(newer);
    });
});
