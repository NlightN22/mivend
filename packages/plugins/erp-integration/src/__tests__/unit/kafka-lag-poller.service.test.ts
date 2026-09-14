import { describe, expect, it, vi } from 'vitest';

vi.mock('@vendure/core', async importOriginal => {
    const actual = await importOriginal<typeof import('@vendure/core')>();
    return { ...actual, Logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } };
});

import { Logger } from '@vendure/core';
import { KafkaLagPollerService } from '../../kafka-lag-poller.service';
import type { ErpIntegrationPluginOptions } from '../../types';

function makeOptions(
    overrides: Partial<ErpIntegrationPluginOptions> = {},
): ErpIntegrationPluginOptions {
    return {
        instanceType: 'central',
        kafkaEnabled: true,
        kafka: { brokers: ['x'], clientId: 'x', topic: 'x' },
        kafkaConsumer: {
            brokers: ['x'],
            clientId: 'x',
            groupId: 'grp',
            topics: { category: 'topic-a', product: 'topic-b' } as never,
        },
        schemaRegistry: { url: 'http://x' },
        ...overrides,
    };
}

function makeAdmin(behavior: {
    topicOffsetsByTopic: Record<string, Array<{ partition: number; offset: string }>>;
    groupOffsetsByTopic: Record<string, Array<{ partition: number; offset: string }>>;
    failTopics?: string[];
}) {
    return {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        fetchTopicOffsets: vi.fn(async (topic: string) => {
            if (behavior.failTopics?.includes(topic)) throw new Error(`denied: ${topic}`);
            return behavior.topicOffsetsByTopic[topic] ?? [];
        }),
        fetchOffsets: vi.fn(async ({ topics }: { topics: string[] }) => {
            const topic = topics[0];
            return [{ topic, partitions: behavior.groupOffsetsByTopic[topic] ?? [] }];
        }),
    };
}

function makeDataSource() {
    const rows: Array<Record<string, unknown>> = [];
    const upsert = vi.fn(async (data: Record<string, unknown>) => {
        rows.push(data);
    });
    return {
        rows,
        dataSource: {
            getRepository: (_entity: unknown) => ({ upsert }),
        } as never,
    };
}

describe('KafkaLagPollerService', () => {
    it('computes lag as endOffset - committedOffset per partition', async () => {
        const admin = makeAdmin({
            topicOffsetsByTopic: { 'topic-a': [{ partition: 0, offset: '100' }] },
            groupOffsetsByTopic: { 'topic-a': [{ partition: 0, offset: '60' }] },
        });
        const { dataSource, rows } = makeDataSource();
        const service = new KafkaLagPollerService(
            makeOptions({
                kafkaConsumer: {
                    brokers: ['x'],
                    clientId: 'x',
                    groupId: 'grp',
                    topics: { category: 'topic-a' } as never,
                },
            }),
            dataSource,
        );
        vi.spyOn(
            service as unknown as { createAdmin: () => unknown },
            'createAdmin',
        ).mockReturnValue(admin as never);

        const result = await service.pollAll();

        expect(result).toEqual({ polledTopics: 1, failedTopics: [] });
        expect(rows).toEqual([
            expect.objectContaining({
                topic: 'topic-a',
                partition: 0,
                committedOffset: '60',
                endOffset: '100',
                lag: '40',
            }),
        ]);
    });

    it('reports lag as "0" (not null/"unknown") when the consumer is fully caught up', async () => {
        const admin = makeAdmin({
            topicOffsetsByTopic: { 'topic-a': [{ partition: 0, offset: '172997' }] },
            groupOffsetsByTopic: { 'topic-a': [{ partition: 0, offset: '172997' }] },
        });
        const { dataSource, rows } = makeDataSource();
        const service = new KafkaLagPollerService(
            makeOptions({
                kafkaConsumer: {
                    brokers: ['x'],
                    clientId: 'x',
                    groupId: 'grp',
                    topics: { category: 'topic-a' } as never,
                },
            }),
            dataSource,
        );
        vi.spyOn(
            service as unknown as { createAdmin: () => unknown },
            'createAdmin',
        ).mockReturnValue(admin as never);

        await service.pollAll();

        expect(rows).toEqual([
            expect.objectContaining({ committedOffset: '172997', endOffset: '172997', lag: '0' }),
        ]);
    });

    it('reports lag as null when the consumer group has never committed an offset (offset -1)', async () => {
        const admin = makeAdmin({
            topicOffsetsByTopic: { 'topic-a': [{ partition: 0, offset: '100' }] },
            groupOffsetsByTopic: { 'topic-a': [{ partition: 0, offset: '-1' }] },
        });
        const { dataSource, rows } = makeDataSource();
        const service = new KafkaLagPollerService(
            makeOptions({
                kafkaConsumer: {
                    brokers: ['x'],
                    clientId: 'x',
                    groupId: 'grp',
                    topics: { category: 'topic-a' } as never,
                },
            }),
            dataSource,
        );
        vi.spyOn(
            service as unknown as { createAdmin: () => unknown },
            'createAdmin',
        ).mockReturnValue(admin as never);

        await service.pollAll();

        expect(rows).toEqual([
            expect.objectContaining({ committedOffset: null, endOffset: '100', lag: null }),
        ]);
    });

    it('isolates a failing topic — other topics still get polled and persisted', async () => {
        const admin = makeAdmin({
            topicOffsetsByTopic: { 'topic-b': [{ partition: 0, offset: '10' }] },
            groupOffsetsByTopic: { 'topic-b': [{ partition: 0, offset: '5' }] },
            failTopics: ['topic-a'],
        });
        const { dataSource, rows } = makeDataSource();
        const service = new KafkaLagPollerService(makeOptions(), dataSource);
        vi.spyOn(
            service as unknown as { createAdmin: () => unknown },
            'createAdmin',
        ).mockReturnValue(admin as never);

        const result = await service.pollAll();

        expect(result).toEqual({ polledTopics: 1, failedTopics: ['topic-a'] });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual(expect.objectContaining({ topic: 'topic-b', lag: '5' }));
    });

    it('logs a warning when lag exceeds the configured threshold', async () => {
        const admin = makeAdmin({
            topicOffsetsByTopic: { 'topic-a': [{ partition: 0, offset: '2000' }] },
            groupOffsetsByTopic: { 'topic-a': [{ partition: 0, offset: '0' }] },
        });
        const { dataSource } = makeDataSource();
        const service = new KafkaLagPollerService(
            makeOptions({
                kafkaLagWarnThreshold: 500,
                kafkaConsumer: {
                    brokers: ['x'],
                    clientId: 'x',
                    groupId: 'grp',
                    topics: { category: 'topic-a' } as never,
                },
            }),
            dataSource,
        );
        vi.spyOn(
            service as unknown as { createAdmin: () => unknown },
            'createAdmin',
        ).mockReturnValue(admin as never);

        await service.pollAll();

        expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('lag'), expect.anything());
    });

    it('always disconnects the admin client, even when a topic poll throws', async () => {
        const admin = makeAdmin({
            topicOffsetsByTopic: {},
            groupOffsetsByTopic: {},
            failTopics: ['topic-a', 'topic-b'],
        });
        const { dataSource } = makeDataSource();
        const service = new KafkaLagPollerService(makeOptions(), dataSource);
        vi.spyOn(
            service as unknown as { createAdmin: () => unknown },
            'createAdmin',
        ).mockReturnValue(admin as never);

        await service.pollAll();

        expect(admin.disconnect).toHaveBeenCalledTimes(1);
    });
});
