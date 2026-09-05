import { describe, expect, it, vi } from 'vitest';

import { KafkaConsumerBootstrapService } from '../../kafka-consumer-bootstrap.service';
import type { ErpIntegrationPluginOptions } from '../../types';

function makeOptions(
    instanceType: 'central' | 'branch',
    kafkaEnabled = true,
): ErpIntegrationPluginOptions {
    return {
        instanceType,
        kafkaEnabled,
        kafka: { brokers: ['x'], clientId: 'x', topic: 'x' },
        kafkaConsumer: {
            brokers: ['x'],
            clientId: 'x',
            groupId: 'x',
            topics: {
                category: 'c',
                organization: 'o',
                warehouse: 'w',
                'price-type': 'pt',
                product: 'p',
                offer: 'of',
                price: 'pr',
                stock: 's',
            },
        },
        schemaRegistry: { url: 'http://x' },
        redis: { host: 'x', port: 1 },
    };
}

function makeProcessContext(isWorker: boolean): never {
    return { isWorker, isServer: !isWorker } as never;
}

// Central-hub-only guard (AGENTS.md sync rule #6 / issue #62 design point 1) — a branch instance
// must never start a Kafka connection to Integration Service. Also worker-process-only (issue
// #67) — running in both `main.ts` and `worker.ts` joined the same Kafka consumer group twice,
// triggering a rebalance that silently stalled consumption for the reassigned partitions.
describe('KafkaConsumerBootstrapService.onApplicationBootstrap', () => {
    it('starts the Kafka consumer on a central worker process', async () => {
        const start = vi.fn().mockResolvedValue(undefined);
        const service = new KafkaConsumerBootstrapService(
            { start } as never,
            makeProcessContext(true),
            makeOptions('central'),
        );
        await service.onApplicationBootstrap();
        expect(start).toHaveBeenCalledTimes(1);
    });

    it('never starts the Kafka consumer on a central server (main) process', async () => {
        const start = vi.fn().mockResolvedValue(undefined);
        const service = new KafkaConsumerBootstrapService(
            { start } as never,
            makeProcessContext(false),
            makeOptions('central'),
        );
        await service.onApplicationBootstrap();
        expect(start).not.toHaveBeenCalled();
    });

    it('never starts the Kafka consumer on a branch instance, even in the worker process', async () => {
        const start = vi.fn().mockResolvedValue(undefined);
        const service = new KafkaConsumerBootstrapService(
            { start } as never,
            makeProcessContext(true),
            makeOptions('branch'),
        );
        await service.onApplicationBootstrap();
        expect(start).not.toHaveBeenCalled();
    });

    // Issue #68: a plain `make dev` (local contour) must never reach a real Integration Service
    // broker just because instanceType === 'central' and this happens to be the worker process —
    // kafkaEnabled must be explicitly opted into per contour.
    it('never starts the Kafka consumer when kafkaEnabled is false, even on a central worker', async () => {
        const start = vi.fn().mockResolvedValue(undefined);
        const service = new KafkaConsumerBootstrapService(
            { start } as never,
            makeProcessContext(true),
            makeOptions('central', false),
        );
        await service.onApplicationBootstrap();
        expect(start).not.toHaveBeenCalled();
    });

    it('never starts the Kafka consumer when kafkaEnabled is left undefined (fail-safe default)', async () => {
        const start = vi.fn().mockResolvedValue(undefined);
        const options = makeOptions('central', true);
        delete options.kafkaEnabled;
        const service = new KafkaConsumerBootstrapService(
            { start } as never,
            makeProcessContext(true),
            options,
        );
        await service.onApplicationBootstrap();
        expect(start).not.toHaveBeenCalled();
    });
});
