import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { OutboundGateway, outboundSend, outboundSkip } from '../../outbound-gateway';

function makeGateway(): {
    gateway: OutboundGateway;
    outbox: { writeToOutbox: Mock; writeSkipped: Mock };
} {
    const outbox = {
        writeToOutbox: vi.fn().mockResolvedValue(undefined),
        writeSkipped: vi.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
        transaction: vi.fn(async (work: (em: unknown) => Promise<void>) => work({})),
    };
    return { gateway: new OutboundGateway(dataSource as never, outbox as never), outbox };
}

const subject = { orderId: 'order-1', orderCode: 'ORD-1' };

describe('OutboundGateway.enqueue', () => {
    it('writes one pending row per event and reports queued', async () => {
        const { gateway, outbox } = makeGateway();

        const outcome = await gateway.enqueue({
            eventType: 'order.confirmed',
            subject,
            build: async () =>
                outboundSend([{ payload: { a: 1 } }, { eventId: 'e-2', payload: { a: 2 } }]),
        });

        expect(outcome).toBe('queued');
        expect(outbox.writeToOutbox).toHaveBeenCalledTimes(2);
        expect(outbox.writeSkipped).not.toHaveBeenCalled();
    });

    it('records a skipped row with the reason and the subject, and writes nothing to publish', async () => {
        const { gateway, outbox } = makeGateway();

        const outcome = await gateway.enqueue({
            eventType: 'order.confirmed',
            subject,
            build: async () => outboundSkip('no organizationId'),
        });

        expect(outcome).toBe('skipped');
        expect(outbox.writeToOutbox).not.toHaveBeenCalled();
        expect(outbox.writeSkipped).toHaveBeenCalledWith(expect.anything(), {
            eventType: 'order.confirmed',
            subject,
            reason: 'no organizationId',
        });
    });

    it('treats a send with no events as a skip, never as silent success', async () => {
        const { gateway, outbox } = makeGateway();

        const outcome = await gateway.enqueue({
            eventType: 'order.confirmed',
            subject,
            build: async () => outboundSend([]),
        });

        expect(outcome).toBe('skipped');
        expect(outbox.writeSkipped).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ reason: 'builder returned no events' }),
        );
    });

    it('records a skipped row and rethrows when the builder throws', async () => {
        const { gateway, outbox } = makeGateway();

        await expect(
            gateway.enqueue({
                eventType: 'order.confirmed',
                subject,
                build: async () => {
                    throw new Error('db down');
                },
            }),
        ).rejects.toThrow('db down');

        expect(outbox.writeSkipped).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ reason: 'build failed: db down' }),
        );
    });
});
