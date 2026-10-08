import { create, toBinary } from '@bufbuild/protobuf';
import { ManufacturerChangedSchema } from '@nlightn22/event-contracts';
import { describe, expect, it, vi } from 'vitest';

import { KafkaConsumerService } from '../../kafka-consumer.service';

function setup(
    enqueue: ReturnType<typeof vi.fn>,
    enqueueRejected: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined),
): (value: Uint8Array | null) => Promise<void> {
    const service = new KafkaConsumerService(
        {} as never,
        { enqueue, enqueueRejected } as never,
        {} as never,
    );
    const handle = (value: Uint8Array | null) =>
        (
            service as unknown as {
                handleMessage(s: string, p: unknown): Promise<void>;
            }
        ).handleMessage('manufacturer', {
            partition: 2,
            message: { value: value && Buffer.from(value), offset: '1', key: null },
        });
    return handle;
}

const valid = toBinary(
    ManufacturerChangedSchema,
    create(ManufacturerChangedSchema, { entityId: 'm-1', eventId: 'e-1', name: 'Acme' }),
);

describe('KafkaConsumerService.handleMessage', () => {
    it('enqueues a decoded manufacturer message', async () => {
        const enqueue = vi.fn().mockResolvedValue(undefined);
        await setup(enqueue)(valid);
        expect(enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
                stream: 'manufacturer',
                entityId: 'm-1',
                sourceEventId: 'e-1',
            }),
        );
    });

    it('rejects when enqueue fails so the offset is not committed', async () => {
        const enqueue = vi.fn().mockRejectedValue(new Error('db down'));
        await expect(setup(enqueue)(valid)).rejects.toThrow('db down');
    });

    it('dead-letters an undecodable payload as a rejected row instead of dropping it', async () => {
        const enqueue = vi.fn();
        const enqueueRejected = vi.fn().mockResolvedValue(undefined);

        await setup(enqueue, enqueueRejected)(new Uint8Array([255, 255, 255]));

        expect(enqueue).not.toHaveBeenCalled();
        expect(enqueueRejected).toHaveBeenCalledWith(
            expect.objectContaining({
                stream: 'manufacturer',
                partition: 2,
                offset: '1',
                reason: expect.stringContaining('decode failed'),
                payload: { rawBase64: '////' },
            }),
        );
    });

    it('dead-letters a message with no value', async () => {
        const enqueueRejected = vi.fn().mockResolvedValue(undefined);

        await setup(vi.fn(), enqueueRejected)(null);

        expect(enqueueRejected).toHaveBeenCalledWith(
            expect.objectContaining({ reason: 'message has no value' }),
        );
    });

    it('dead-letters a decoded message with no entityId/eventId', async () => {
        const enqueue = vi.fn();
        const enqueueRejected = vi.fn().mockResolvedValue(undefined);
        const noIdentity = toBinary(
            ManufacturerChangedSchema,
            create(ManufacturerChangedSchema, { name: 'Acme' }),
        );

        await setup(enqueue, enqueueRejected)(noIdentity);

        expect(enqueue).not.toHaveBeenCalled();
        expect(enqueueRejected).toHaveBeenCalledWith(
            expect.objectContaining({ reason: 'missing entityId/eventId' }),
        );
    });

    it('rethrows when recording the rejection fails so the offset is not committed', async () => {
        const enqueueRejected = vi.fn().mockRejectedValue(new Error('db down'));

        await expect(setup(vi.fn(), enqueueRejected)(null)).rejects.toThrow('db down');
    });

    it('rejects when the stream has no schema so the offset is not committed', async () => {
        const service = new KafkaConsumerService(
            {} as never,
            { enqueue: vi.fn() } as never,
            {} as never,
        );
        const handle = service as unknown as {
            handleMessage(s: string, p: unknown): Promise<void>;
        };
        await expect(
            handle.handleMessage('no-such-stream', { message: { value: Buffer.from(valid) } }),
        ).rejects.toThrow('No schema');
    });
});
