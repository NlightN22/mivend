import { EventEmitter } from 'events';

import { create, toBinary } from '@bufbuild/protobuf';
import { ErpOrderEventSchema, OrderChangedSchema } from '@nlightn22/event-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONSUMER_EVENTS = {
    CONNECT: 'consumer.connect',
    DISCONNECT: 'consumer.disconnect',
    CRASH: 'consumer.crash',
};

// Same fake shape as kafka-consumer-crash-retry.test.ts's own FakeConsumer — subscribe is
// per-call rejectable here (via subscribeImpl) to drive the per-topic isolation this test covers.
class FakeConsumer extends EventEmitter {
    events = CONSUMER_EVENTS;
    connect = vi.fn().mockResolvedValue(undefined);
    run = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    subscribeImpl: (args: { topic: string }) => Promise<void> = async () => undefined;
    subscribe = vi.fn((args: { topic: string }) => this.subscribeImpl(args));
}

const createdConsumers: FakeConsumer[] = [];

vi.mock('kafkajs', () => ({
    Kafka: class {
        consumer(): FakeConsumer {
            const c = new FakeConsumer();
            createdConsumers.push(c);
            return c;
        }
    },
}));

// Imported after the mock so KafkaConsumerService picks up the mocked `Kafka`.
import { KafkaConsumerService } from '../../kafka-consumer.service';
import type { ErpIntegrationPluginOptions } from '../../types';

function makeOptions(): ErpIntegrationPluginOptions {
    return {
        instanceType: 'central',
        kafkaEnabled: true,
        kafka: { brokers: ['x'], clientId: 'x' },
        kafkaConsumer: {
            brokers: ['x'],
            clientId: 'x',
            groupId: 'mivend-central-hub',
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
                'order-registration-result': 'erp.order.events.v1',
                'order-changed': 'erp.order.events.v1',
                'order-cancel-result': 'erp.order.events.v1',
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

describe('KafkaConsumerService per-topic subscribe isolation', () => {
    beforeEach(() => {
        createdConsumers.length = 0;
    });

    it('subscribes to every topic and calls run() when all succeed (no regression)', async () => {
        const service = new KafkaConsumerService(
            makeOptions(),
            { enqueue: vi.fn() } as never,
            { getRepository: () => ({ upsert: vi.fn().mockResolvedValue(undefined) }) } as never,
        );
        await service.start();

        expect(createdConsumers[0].subscribe).toHaveBeenCalledTimes(35);
        expect(createdConsumers[0].run).toHaveBeenCalledTimes(1);
    });

    it('does not subscribe to a topic whose stream has no schema', async () => {
        const options = makeOptions();
        (options.kafkaConsumer.topics as Record<string, string>)['no-schema'] = 'orphan-topic';
        const service = new KafkaConsumerService(
            options,
            { enqueue: vi.fn() } as never,
            { getRepository: () => ({ upsert: vi.fn().mockResolvedValue(undefined) }) } as never,
        );
        await service.start();

        expect(createdConsumers[0].subscribe).toHaveBeenCalledTimes(35);
        expect(createdConsumers[0].subscribe).not.toHaveBeenCalledWith(
            expect.objectContaining({ topic: 'orphan-topic' }),
        );
    });

    // Regression case for the live incident: an ACL denial on storage-location/stock-organization
    // used to throw out of the whole subscribe loop before consumer.run() was ever reached,
    // silently halting consumption of every other, perfectly healthy topic too.
    it('skips a topic whose subscribe() rejects (e.g. ACL denial) and still consumes the rest', async () => {
        const service = new KafkaConsumerService(
            makeOptions(),
            { enqueue: vi.fn() } as never,
            { getRepository: () => ({ upsert: vi.fn().mockResolvedValue(undefined) }) } as never,
        );
        const consumerPromise = service.start();

        // subscribeImpl is only assigned once the fake Consumer exists — start() awaits connect()
        // first (a resolved mock), so by the time subscribe() is actually called the consumer is
        // already in createdConsumers. Set it synchronously before awaiting, since connect()
        // resolves on the same microtask queue turn.
        await Promise.resolve();
        createdConsumers[0].subscribeImpl = async ({ topic }) => {
            if (topic === 'sl') {
                throw new Error('Not authorized to access topics: [Topic authorization failed]');
            }
        };

        await consumerPromise;

        expect(createdConsumers[0].subscribe).toHaveBeenCalledTimes(35);
        // run() must still be reached even though one subscribe() rejected.
        expect(createdConsumers[0].run).toHaveBeenCalledTimes(1);
    });

    it('still calls run() (idle, not a crash) when every topic fails to subscribe', async () => {
        const service = new KafkaConsumerService(
            makeOptions(),
            { enqueue: vi.fn() } as never,
            { getRepository: () => ({ upsert: vi.fn().mockResolvedValue(undefined) }) } as never,
        );
        const consumerPromise = service.start();

        await Promise.resolve();
        createdConsumers[0].subscribeImpl = async () => {
            throw new Error('Not authorized to access topics: [Topic authorization failed]');
        };

        await expect(consumerPromise).resolves.toBeUndefined();
        expect(createdConsumers[0].run).toHaveBeenCalledTimes(1);
    });

    it('subscribes to the shared order topic once and routes its messages by type', async () => {
        const enqueue = vi.fn();
        const enqueueRejected = vi.fn();
        const service = new KafkaConsumerService(
            makeOptions(),
            { enqueue, enqueueRejected } as never,
            { getRepository: () => ({ upsert: vi.fn().mockResolvedValue(undefined) }) } as never,
        );
        await service.start();

        const orderSubscriptions = createdConsumers[0].subscribe.mock.calls.filter(
            ([args]) => args.topic === 'erp.order.events.v1',
        );
        expect(orderSubscriptions).toHaveLength(1);

        const { eachMessage } = createdConsumers[0].run.mock.calls[0][0];
        const event = toBinary(
            ErpOrderEventSchema,
            create(ErpOrderEventSchema, {
                event: {
                    case: 'changed',
                    value: create(OrderChangedSchema, { entityId: 'e-1', eventId: 'ev-1' }),
                },
            }),
        );
        const kafkaMessage = (type: string, value: Uint8Array) => ({
            topic: 'erp.order.events.v1',
            partition: 0,
            message: {
                key: Buffer.from('o-1'),
                value: Buffer.from(value),
                offset: '1',
                headers: { type: Buffer.from(type) },
            },
        });
        await eachMessage(kafkaMessage('changed', event));
        await eachMessage(kafkaMessage('future-type', Uint8Array.of(9)));

        expect(enqueue).toHaveBeenCalledTimes(1);
        expect(enqueue).toHaveBeenCalledWith(
            expect.objectContaining({ stream: 'order-changed', entityId: 'e-1' }),
        );
        expect(enqueueRejected).not.toHaveBeenCalled();
    });
});
