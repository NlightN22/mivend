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
                'storage-location': 'sl',
                'stock-organization': 'so',
                'order-registration-result': 'orr',
                'order-changed': 'oc',
                department: 'dept',
                counterparty: 'cp',
            },
        },
        schemaRegistry: { url: 'http://x' },
    };
}

function makeProcessContext(isWorker: boolean): never {
    return { isWorker, isServer: !isWorker } as never;
}

function makeCollectionService(): { setApplyAllFiltersOnProductUpdates: ReturnType<typeof vi.fn> } {
    return { setApplyAllFiltersOnProductUpdates: vi.fn() };
}

// Central-hub-only guard (the external-integration-rules skill / issue #62 design point 1) — a branch instance
// must never start a Kafka connection to Integration Service. Also worker-process-only (issue
// #67) — running in both `main.ts` and `worker.ts` joined the same Kafka consumer group twice,
// triggering a rebalance that silently stalled consumption for the reassigned partitions.
describe('KafkaConsumerBootstrapService.onApplicationBootstrap', () => {
    it('starts the Kafka consumer on a central worker process', async () => {
        const start = vi.fn().mockResolvedValue(undefined);
        const service = new KafkaConsumerBootstrapService(
            { start } as never,
            makeProcessContext(true),
            makeCollectionService() as never,
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
            makeCollectionService() as never,
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
            makeCollectionService() as never,
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
            makeCollectionService() as never,
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
            makeCollectionService() as never,
            options,
        );
        await service.onApplicationBootstrap();
        expect(start).not.toHaveBeenCalled();
    });

    // Real incident: the default per-ProductEvent recompute (50ms debounce, one
    // apply-collection-filters job per event, each recomputing every Collection) enqueued tens
    // of thousands of jobs once real Kafka product traffic flowed at scale — see
    // collection-filters-recompute.scheduled-task.ts for the batched replacement this disables in
    // favour of.
    it('disables CollectionService.applyAllFiltersOnProductUpdates on a central worker with Kafka enabled', async () => {
        const collectionService = makeCollectionService();
        const service = new KafkaConsumerBootstrapService(
            { start: vi.fn().mockResolvedValue(undefined) } as never,
            makeProcessContext(true),
            collectionService as never,
            makeOptions('central'),
        );
        await service.onApplicationBootstrap();
        expect(collectionService.setApplyAllFiltersOnProductUpdates).toHaveBeenCalledWith(false);
    });

    it('leaves CollectionService.applyAllFiltersOnProductUpdates untouched on the server process', async () => {
        const collectionService = makeCollectionService();
        const service = new KafkaConsumerBootstrapService(
            { start: vi.fn().mockResolvedValue(undefined) } as never,
            makeProcessContext(false),
            collectionService as never,
            makeOptions('central'),
        );
        await service.onApplicationBootstrap();
        expect(collectionService.setApplyAllFiltersOnProductUpdates).not.toHaveBeenCalled();
    });

    it('leaves CollectionService.applyAllFiltersOnProductUpdates untouched on a branch instance', async () => {
        const collectionService = makeCollectionService();
        const service = new KafkaConsumerBootstrapService(
            { start: vi.fn().mockResolvedValue(undefined) } as never,
            makeProcessContext(true),
            collectionService as never,
            makeOptions('branch'),
        );
        await service.onApplicationBootstrap();
        expect(collectionService.setApplyAllFiltersOnProductUpdates).not.toHaveBeenCalled();
    });

    it('leaves CollectionService.applyAllFiltersOnProductUpdates untouched when kafkaEnabled is false', async () => {
        const collectionService = makeCollectionService();
        const service = new KafkaConsumerBootstrapService(
            { start: vi.fn().mockResolvedValue(undefined) } as never,
            makeProcessContext(true),
            collectionService as never,
            makeOptions('central', false),
        );
        await service.onApplicationBootstrap();
        expect(collectionService.setApplyAllFiltersOnProductUpdates).not.toHaveBeenCalled();
    });
});
