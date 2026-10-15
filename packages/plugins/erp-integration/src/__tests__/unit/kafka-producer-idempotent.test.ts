import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KafkaProducerService } from '../../kafka-producer.service';
import type { ErpIntegrationPluginOptions } from '../../types';

// Retries after a transient send failure can duplicate messages; idempotent:true prevents this.
// It requires acks:-1 and maxInFlightRequests<=5, so those must stay set alongside it.
const sendMock = vi.fn().mockResolvedValue(undefined);
const producerFactory = vi.fn((_config: unknown) => ({
    connect: vi.fn().mockResolvedValue(undefined),
    send: sendMock,
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
        sendMock.mockClear();
    });

    it('constructs the underlying kafkajs producer with idempotent:true and its required companions', async () => {
        const options = {
            kafka: { brokers: ['x'], clientId: 'x' },
        } as unknown as ErpIntegrationPluginOptions;
        const schemaRegistry = { resolveSchemaId: vi.fn().mockResolvedValue(1) } as never;
        const service = new KafkaProducerService(options, schemaRegistry);

        await service.publish('order.confirmed', { a: 1 });

        expect(producerFactory).toHaveBeenCalledWith(
            expect.objectContaining({
                idempotent: true,
                maxInFlightRequests: 5,
            }),
        );
        // acks:-1 is a per-send() option in kafkajs's types, not part of ProducerConfig — see
        // kafka-producer.service.ts's publish().
        expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ acks: -1 }));
    });

    it('publishes to the order-events topic keyed by orderUuid with the type header and union subject', async () => {
        const options = {
            kafka: { brokers: ['x'], clientId: 'x' },
        } as unknown as ErpIntegrationPluginOptions;
        const resolveSchemaId = vi.fn().mockResolvedValue(1);
        const service = new KafkaProducerService(options, { resolveSchemaId } as never);
        const payload = { eventId: 'e-1', orderUuid: 'order-uuid-1', type: 'confirmed' };

        await service.publish('order.confirmed', payload);
        await service.publish('order.confirmed', payload);

        expect(resolveSchemaId).toHaveBeenCalledWith('mivend.order.commands.v1', expect.anything());
        const sent = sendMock.mock.calls.map(call => call[0]);
        expect(sent).toHaveLength(2);
        for (const message of sent) {
            expect(message.topic).toBe('mivend.order.commands.v1');
            expect(message.messages[0].key).toBe('order-uuid-1');
            expect(message.messages[0].headers).toEqual({ type: 'confirmed' });
        }
    });
});
