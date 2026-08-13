import { describe, expect, it, vi } from 'vitest';

import { KafkaConsumerBootstrapService } from '../../kafka-consumer-bootstrap.service';
import type { ErpIntegrationPluginOptions } from '../../types';

function makeOptions(instanceType: 'central' | 'branch'): ErpIntegrationPluginOptions {
    return {
        instanceType,
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

// Central-hub-only guard (AGENTS.md sync rule #6 / issue #62 design point 1) — a branch instance
// must never start a Kafka connection to Integration Service.
describe('KafkaConsumerBootstrapService.onApplicationBootstrap', () => {
    it('starts the Kafka consumer on a central instance', async () => {
        const start = vi.fn().mockResolvedValue(undefined);
        const service = new KafkaConsumerBootstrapService(
            { start } as never,
            makeOptions('central'),
        );
        await service.onApplicationBootstrap();
        expect(start).toHaveBeenCalledTimes(1);
    });

    it('never starts the Kafka consumer on a branch instance', async () => {
        const start = vi.fn().mockResolvedValue(undefined);
        const service = new KafkaConsumerBootstrapService(
            { start } as never,
            makeOptions('branch'),
        );
        await service.onApplicationBootstrap();
        expect(start).not.toHaveBeenCalled();
    });
});
