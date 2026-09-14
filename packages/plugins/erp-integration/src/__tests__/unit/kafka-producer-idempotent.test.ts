import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KafkaProducerService } from '../../kafka-producer.service';
import type { ErpIntegrationPluginOptions } from '../../types';

// A real transient send failure (broker timeout, leader-not-available) can make kafkajs's own
// internal retry resend a message — without idempotent:true (and its required acks:-1 /
// maxInFlightRequests<=5 companions) that resend can duplicate the message on the broker. See
// this project's earlier gap (mivend audit): the consumer side already dedupes on a stable
// sourceEventId, but the producer/broker side had no equivalent guarantee at all.
const producerFactory = vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('kafkajs', () => ({
    Kafka: class {
        producer(config: unknown): unknown {
            return producerFactory(config);
        }
    },
}));

describe('KafkaProducerService — producer idempotency', () => {
    beforeEach(() => {
        producerFactory.mockClear();
    });

    it('constructs the underlying kafkajs producer with idempotent:true and its required companions', async () => {
        const options = {
            kafka: { brokers: ['x'], clientId: 'x', topic: 'x' },
        } as unknown as ErpIntegrationPluginOptions;
        const schemaRegistry = { resolveSchemaId: vi.fn().mockResolvedValue(1) } as never;
        const service = new KafkaProducerService(options, schemaRegistry);

        await service.publish('event-1', 'order.submitted', { a: 1 });

        expect(producerFactory).toHaveBeenCalledWith(
            expect.objectContaining({
                idempotent: true,
                acks: -1,
                maxInFlightRequests: 5,
            }),
        );
    });
});
