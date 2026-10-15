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
        kafka: { brokers: ['x'], clientId: 'x' },
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
                unit: 'unit',
                manufacturer: 'manufacturer',
                region: 'region',
                'legal-form': 'legal-form',
                bank: 'bank',
                'bank-account': 'bank-account',
                'product-photo': 'product-photo',
                'order-registration-result': 'orr',
                'order-changed': 'oc',
                'order-cancel-result': 'ocr',
                department: 'dept',
                counterparty: 'cp',
                'counterparty-credit-balance': 'cpcb',
                user: 'usr',
                'promo-rule': 'pr2',
                'vat-rate': 'vr2',
                'point-of-sale': 'pos2',
                contract: 'contract2',
                'discount-rule': 'dr2',
                'granted-discount': 'gd2',
                'retro-bonus-rule': 'rbr2',
                'granted-retro-bonus': 'grb2',
                position: 'pos3',
                'settlement-document': 'sdoc',
                'settlement-balance': 'sbal',
                'settlement-document-type': 'sdtype',
                'order-status': 'ostat',
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

function makeChannelService(pricesIncludeTax = true): {
    getDefaultChannel: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
} {
    return {
        getDefaultChannel: vi.fn().mockResolvedValue({ id: 'default-channel', pricesIncludeTax }),
        update: vi.fn().mockResolvedValue(undefined),
    };
}

// Defaults to worker.ts's own activeQueues shape (includes 'apply-collection-filters') so every
// existing "central worker" test case below keeps meaning the real worker, not worker-email.
function makeConfigService(activeQueues: string[] | undefined = ['apply-collection-filters']): {
    jobQueueOptions: { activeQueues: string[] | undefined };
} {
    return { jobQueueOptions: { activeQueues } };
}

// Branch instances must never open a Kafka connection to Integration Service.
// Worker-only: running in both main.ts and worker.ts joins the consumer group twice and stalls it.
describe('KafkaConsumerBootstrapService.onApplicationBootstrap', () => {
    it('starts the Kafka consumer on a central worker process', async () => {
        const start = vi.fn().mockResolvedValue(undefined);
        const service = new KafkaConsumerBootstrapService(
            { start } as never,
            makeProcessContext(true),
            makeCollectionService() as never,
            makeChannelService() as never,
            { ensureChannelDefaultsForExistingZone: vi.fn() } as never,
            makeConfigService() as never,
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
            makeChannelService() as never,
            { ensureChannelDefaultsForExistingZone: vi.fn() } as never,
            makeConfigService() as never,
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
            makeChannelService() as never,
            { ensureChannelDefaultsForExistingZone: vi.fn() } as never,
            makeConfigService() as never,
            makeOptions('branch'),
        );
        await service.onApplicationBootstrap();
        expect(start).not.toHaveBeenCalled();
    });

    // kafkaEnabled must be explicitly opted into per contour; instanceType alone is not enough.
    // Otherwise a local `make dev` on the central worker would reach a real Integration Service broker.
    it('never starts the Kafka consumer when kafkaEnabled is false, even on a central worker', async () => {
        const start = vi.fn().mockResolvedValue(undefined);
        const service = new KafkaConsumerBootstrapService(
            { start } as never,
            makeProcessContext(true),
            makeCollectionService() as never,
            makeChannelService() as never,
            { ensureChannelDefaultsForExistingZone: vi.fn() } as never,
            makeConfigService() as never,
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
            makeChannelService() as never,
            { ensureChannelDefaultsForExistingZone: vi.fn() } as never,
            makeConfigService() as never,
            options,
        );
        await service.onApplicationBootstrap();
        expect(start).not.toHaveBeenCalled();
    });

    // Per-ProductEvent recompute enqueued tens of thousands of jobs under real Kafka traffic.
    // Disabled in favor of the batched collection-filters-recompute.scheduled-task.ts.
    it('disables CollectionService.applyAllFiltersOnProductUpdates on a central worker with Kafka enabled', async () => {
        const collectionService = makeCollectionService();
        const service = new KafkaConsumerBootstrapService(
            { start: vi.fn().mockResolvedValue(undefined) } as never,
            makeProcessContext(true),
            collectionService as never,
            makeChannelService() as never,
            { ensureChannelDefaultsForExistingZone: vi.fn() } as never,
            makeConfigService() as never,
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
            makeChannelService() as never,
            { ensureChannelDefaultsForExistingZone: vi.fn() } as never,
            makeConfigService() as never,
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
            makeChannelService() as never,
            { ensureChannelDefaultsForExistingZone: vi.fn() } as never,
            makeConfigService() as never,
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
            makeChannelService() as never,
            { ensureChannelDefaultsForExistingZone: vi.fn() } as never,
            makeConfigService() as never,
            makeOptions('central', false),
        );
        await service.onApplicationBootstrap();
        expect(collectionService.setApplyAllFiltersOnProductUpdates).not.toHaveBeenCalled();
    });

    // worker-email.ts has isWorker=true but must never join the Kafka consumer group (rebalance stall).
    // Tell it apart by activeQueues: ['send-email'] only, with no 'apply-collection-filters'.
    it('never starts the Kafka consumer on the email-only worker, even with kafkaEnabled central', async () => {
        const start = vi.fn().mockResolvedValue(undefined);
        const service = new KafkaConsumerBootstrapService(
            { start } as never,
            makeProcessContext(true),
            makeCollectionService() as never,
            makeChannelService() as never,
            { ensureChannelDefaultsForExistingZone: vi.fn() } as never,
            makeConfigService(['send-email']) as never,
            makeOptions('central'),
        );
        await service.onApplicationBootstrap();
        expect(start).not.toHaveBeenCalled();
    });

    it('leaves CollectionService.applyAllFiltersOnProductUpdates untouched on the email-only worker', async () => {
        const collectionService = makeCollectionService();
        const service = new KafkaConsumerBootstrapService(
            { start: vi.fn().mockResolvedValue(undefined) } as never,
            makeProcessContext(true),
            collectionService as never,
            makeChannelService() as never,
            { ensureChannelDefaultsForExistingZone: vi.fn() } as never,
            makeConfigService(['send-email']) as never,
            makeOptions('central'),
        );
        await service.onApplicationBootstrap();
        expect(collectionService.setApplyAllFiltersOnProductUpdates).not.toHaveBeenCalled();
    });

    // main.ts is not a worker at all (isWorker=false already blocks it above), but also never
    // sets activeQueues — confirms isEmailOnlyWorker doesn't misclassify that as email-only.
    it('still starts the Kafka consumer on a central worker with activeQueues unset', async () => {
        const start = vi.fn().mockResolvedValue(undefined);
        const service = new KafkaConsumerBootstrapService(
            { start } as never,
            makeProcessContext(true),
            makeCollectionService() as never,
            makeChannelService() as never,
            { ensureChannelDefaultsForExistingZone: vi.fn() } as never,
            makeConfigService(undefined) as never,
            makeOptions('central'),
        );
        await service.onApplicationBootstrap();
        expect(start).toHaveBeenCalledTimes(1);
    });
});
