import { create, toBinary } from '@bufbuild/protobuf';
import { ManufacturerChangedSchema } from '@nlightn22/event-contracts';
import { describe, expect, it, vi } from 'vitest';

import { KafkaConsumerService } from '../../kafka-consumer.service';

function setup(enqueue: ReturnType<typeof vi.fn>) {
    const service = new KafkaConsumerService({} as never, { enqueue } as never, {} as never);
    const handle = (value: Uint8Array | null) =>
        (
            service as unknown as {
                handleMessage(s: string, p: unknown): Promise<void>;
            }
        ).handleMessage('manufacturer', {
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

    it('skips an undecodable payload without throwing', async () => {
        const enqueue = vi.fn();
        await expect(setup(enqueue)(new Uint8Array([255, 255, 255]))).resolves.toBeUndefined();
        expect(enqueue).not.toHaveBeenCalled();
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
